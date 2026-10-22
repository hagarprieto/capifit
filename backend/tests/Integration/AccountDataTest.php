<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Support\Uuid;

/** Consentimentos (E02-01) e dispositivos de sincronização (E01-08). */
final class AccountDataTest extends ApiTestCase
{
    public function testRegistrationLeavesTheMandatoryConsentsListed(): void
    {
        $list = $this->call('GET', '/me/consentimentos');

        self::assertSame(200, $list['status']);
        self::assertEqualsCanonicalizing(['termos_uso', 'politica_privacidade'], array_column($list['body']['data'], 'tipo'));
        self::assertSame([null, null], array_column($list['body']['data'], 'revogado_em'));
        self::assertSame(401, $this->call('GET', '/me/consentimentos', null, null, false)['status']);
    }

    public function testGrantingHealthDataConsentIsRepeatableAndRevocable(): void
    {
        $first = $this->call('POST', '/me/consentimentos', ['tipo' => 'dados_saude', 'versao_documento' => '1']);
        $again = $this->call('POST', '/me/consentimentos', ['tipo' => 'dados_saude', 'versao_documento' => '1']);

        self::assertSame([201, 201], [$first['status'], $again['status']]);
        self::assertSame($first['body']['data']['id'], $again['body']['data']['id'], 'o mesmo aceite vigente não duplica');
        self::assertCount(3, $this->call('GET', '/me/consentimentos')['body']['data']);

        $id = $first['body']['data']['id'];
        $revoked = $this->call('POST', "/me/consentimentos/$id/revogar");
        self::assertSame(200, $revoked['status']);
        self::assertNotNull($revoked['body']['data']['revogado_em']);
        $stamp = $revoked['body']['data']['revogado_em'];
        self::assertSame($stamp, $this->call('POST', "/me/consentimentos/$id/revogar")['body']['data']['revogado_em'], 'revogar de novo mantém o instante original');

        $regrant = $this->call('POST', '/me/consentimentos', ['tipo' => 'dados_saude', 'versao_documento' => '1']);
        self::assertNotSame($id, $regrant['body']['data']['id'], 'depois de revogado, novo aceite é uma nova linha e o histórico fica');
        self::assertCount(4, $this->call('GET', '/me/consentimentos')['body']['data']);
    }

    public function testConsentRulesAndValidation(): void
    {
        $mandatory = array_values(array_filter($this->call('GET', '/me/consentimentos')['body']['data'], static fn (array $c): bool => $c['tipo'] === 'termos_uso'))[0];
        $refused = $this->call('POST', "/me/consentimentos/{$mandatory['id']}/revogar");
        self::assertSame(409, $refused['status']);
        self::assertSame('CONSENT_MANDATORY', $refused['body']['error']['code']);

        foreach ([['tipo' => 'compartilhamento_coach', 'versao_documento' => '1'], ['tipo' => 'x', 'versao_documento' => '1'], ['tipo' => 'dados_saude'], ['tipo' => 'dados_saude', 'versao_documento' => str_repeat('1', 31)], ['tipo' => 'dados_saude', 'versao_documento' => '1', 'usuario_id' => 1]] as $body) {
            self::assertSame(422, $this->call('POST', '/me/consentimentos', $body)['status'], json_encode($body) ?: '');
        }
    }

    public function testConsentsBelongToTheirOwner(): void
    {
        $mine = $this->call('POST', '/me/consentimentos', ['tipo' => 'dados_saude', 'versao_documento' => '1'])['body']['data']['id'];
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('POST', "/me/consentimentos/$mine/revogar", null, null, true, $other)['status']);
        self::assertSame(404, $this->call('POST', '/me/consentimentos/abc/revogar')['status']);
        self::assertSame(404, $this->call('POST', '/me/consentimentos/999999999/revogar')['status']);
        self::assertCount(2, $this->call('GET', '/me/consentimentos', null, null, true, $other)['body']['data'], 'a lista do outro usuário não traz os meus');
        self::assertNull($this->call('GET', '/me/consentimentos')['body']['data'][0]['revogado_em']);
    }

    public function testDeviceRegistrationIsIdempotentAndListed(): void
    {
        self::assertSame([], $this->call('GET', '/me/dispositivos')['body']['data']);
        $uuid = Uuid::v4();

        $first = $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => strtoupper($uuid)]);
        $again = $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $uuid]);

        self::assertSame([201, 201], [$first['status'], $again['status']]);
        self::assertSame([$uuid, null, null], array_values($first['body']['data']));
        self::assertCount(1, $this->call('GET', '/me/dispositivos')['body']['data']);
        self::assertSame(422, $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => 'nao-e-uuid'])['status']);
        self::assertSame(422, $this->call('POST', '/me/dispositivos', [])['status']);
    }

    public function testRevokingADeviceCutsItsLoginSessionsAndKeepsOthers(): void
    {
        $device = Uuid::v4();
        $email = 'd' . bin2hex(random_bytes(5)) . '@exemplo.invalid';
        $reg = $this->call('POST', '/auth/register', [
            'nome' => 'Teste', 'email' => $email, 'senha' => 'senha-de-teste-bem-longa-42',
            'aceita_termos' => true, 'versao_termos' => '1', 'versao_privacidade' => '1', 'maior_de_18' => true, 'dispositivo_uuid' => $device,
        ], null, false);
        $token = $reg['body']['data']['access_token'];
        $refresh = $reg['body']['data']['refresh_token'];
        $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $device], null, true, $token);

        // um segundo login, em outro dispositivo, não é afetado
        $other = $this->call('POST', '/auth/login', ['email' => $email, 'senha' => 'senha-de-teste-bem-longa-42', 'dispositivo_uuid' => Uuid::v4()], null, false);

        self::assertSame(204, $this->call('DELETE', "/me/dispositivos/$device", null, null, true, $token)['status']);
        self::assertSame(401, $this->call('GET', '/me', null, null, true, $token)['status'], 'o acesso daquele dispositivo foi cortado');
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $refresh], null, false)['status']);
        self::assertSame(200, $this->call('GET', '/me', null, null, true, $other['body']['data']['access_token'])['status']);

        $listed = $this->call('GET', '/me/dispositivos', null, null, true, $other['body']['data']['access_token'])['body']['data'];
        self::assertNotNull($listed[0]['revogado_em']);
        self::assertSame(204, $this->call('DELETE', "/me/dispositivos/$device", null, null, true, $other['body']['data']['access_token'])['status'], 'revogar de novo é idempotente');
        $again = $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $device], null, true, $other['body']['data']['access_token']);
        self::assertSame(422, $again['status'], 'dispositivo revogado não volta com o mesmo UUID');
    }

    public function testDevicesBelongToTheirOwnerAndAreLimited(): void
    {
        $uuid = Uuid::v4();
        $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => $uuid]);
        [$other] = $this->newUser();

        self::assertSame(404, $this->call('DELETE', "/me/dispositivos/$uuid", null, null, true, $other)['status']);
        self::assertSame(404, $this->call('DELETE', '/me/dispositivos/' . Uuid::v4())['status']);
        self::assertSame(404, $this->call('DELETE', '/me/dispositivos/nao-e-uuid')['status']);
        self::assertSame([], $this->call('GET', '/me/dispositivos', null, null, true, $other)['body']['data']);
        self::assertSame(200, $this->call('GET', '/me')['status'], 'a tentativa do outro usuário não revogou nada');

        for ($i = 0; $i < 19; ++$i) {
            self::assertSame(201, $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => Uuid::v4()])['status']);
        }
        self::assertSame(422, $this->call('POST', '/me/dispositivos', ['dispositivo_uuid' => Uuid::v4()])['status'], 'no máximo 20 dispositivos ativos');
    }
}
