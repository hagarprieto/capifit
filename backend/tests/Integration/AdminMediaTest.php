<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Config;
use CapiFit\Support\MediaUrlSigner;
use CapiFit\Support\Uuid;

/** Vínculo, aprovação e entrega de mídia por URL temporária (E03-06; CT-70, CT-71, CT-73). */
final class AdminMediaTest extends ApiTestCase
{
    private const SECRET = 'segredo-de-teste-de-midia-com-mais-de-32-bytes';
    private string $linker = '';
    private string $approver = '';
    private string $run = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->run = 'r' . bin2hex(random_bytes(4));
        $this->kernel->db->close();
        $this->kernel = $this->makeKernel(['MEDIA_BASE_URL' => 'https://cdn.exemplo.invalid/media', 'MEDIA_SIGNING_SECRET' => self::SECRET, 'MEDIA_URL_TTL' => '300']);
        $this->linker = $this->token;
        $this->admin($this->userUuid);
        [$this->approver, $uuid] = $this->newUser();
        $this->admin($uuid);
    }

    private function admin(string $uuid): void
    {
        $this->kernel->db->execute('INSERT INTO usuarios_papeis(usuario_id, papel_id) SELECT id, 3 FROM usuarios WHERE uuid = ?', 's', $uuid);
    }

    private function k(string $key): string
    {
        return $this->run . "/$key";
    }

    /** @return array{status: int, body: array<string, mixed>, headers: array<string, string>} */
    private function link(string $exercise, string $key, string $type = 'video_capi', string $version = '1'): array
    {
        return $this->call('POST', "/admin/exercicios/$exercise/midias", ['tipo' => $type, 'storage_key' => $this->k($key), 'versao' => $version], null, true, $this->linker);
    }

    public function testOnlyAdminsLinkOrApprove(): void
    {
        [$student] = $this->newUser();
        $exercise = $this->published('Remada baixa');

        self::assertSame(403, $this->call('POST', "/admin/exercicios/$exercise/midias", ['tipo' => 'imagem', 'storage_key' => 'a/b.png'], null, true, $student)['status']);
        self::assertSame(403, $this->call('POST', '/admin/midias/1/aprovar', null, null, true, $student)['status']);
    }

    public function testMediaStaysHiddenUntilApprovedByAnotherAdminAndThenIsServedWithASignedUrl(): void
    {
        $exercise = $this->published('Remada baixa');
        $linked = $this->link($exercise, 'ex/remada/v1.mp4');
        self::assertSame(201, $linked['status'], json_encode($linked['body']) ?: '');
        self::assertSame(['video_capi', '1', 'em_revisao'], [$linked['body']['data']['tipo'], $linked['body']['data']['versao'], $linked['body']['data']['status']]);
        $id = $linked['body']['data']['id'];

        self::assertSame([], $this->call('GET', "/exercicios/$exercise/midias")['body']['data'], 'em revisão não aparece');
        self::assertSame(403, $this->call('POST', "/admin/midias/$id/aprovar", null, null, true, $this->linker)['status'], 'quem vincula não aprova');

        $approved = $this->call('POST', "/admin/midias/$id/aprovar", null, null, true, $this->approver);
        self::assertSame(200, $approved['status'], json_encode($approved['body']) ?: '');
        self::assertSame('aprovado', $approved['body']['data']['status']);
        self::assertSame(409, $this->call('POST', "/admin/midias/$id/aprovar", null, null, true, $this->approver)['status'], 'já aprovada');

        /** @var list<array<string, string>> $media */
        $media = $this->call('GET', "/exercicios/$exercise/midias")['body']['data'];
        self::assertCount(1, $media);
        $parts = parse_url($media[0]['url']);
        parse_str((string) $parts['query'], $query);
        self::assertSame('cdn.exemplo.invalid', $parts['host']);
        self::assertSame('/media/' . $this->k('ex/remada/v1.mp4'), $parts['path']);
        self::assertEqualsWithDelta(time() + 300, (int) $query['exp'], 5, 'validade curta configurada');
        $signer = new MediaUrlSigner('https://cdn.exemplo.invalid/media', self::SECRET, 300);
        self::assertTrue($signer->verify($this->k('ex/remada/v1.mp4'), (int) $query['exp'], $query['sig']));
        self::assertSame($media, $this->call('GET', "/exercicios/$exercise")['body']['data']['midias']);
    }

    public function testValidationDuplicatesAndLookups(): void
    {
        $exercise = $this->published('Remada baixa');
        $other = $this->published('Puxada neutra');
        self::assertSame(201, $this->link($exercise, 'ex/remada/v1.mp4')['status']);

        foreach ([['tipo' => 'gif', 'storage_key' => 'a/b.gif'], ['tipo' => 'imagem'], ['tipo' => 'imagem', 'storage_key' => '../etc/passwd'], ['tipo' => 'imagem', 'storage_key' => 'https://x.invalid/a.png'], ['tipo' => 'imagem', 'storage_key' => 'a/b.png', 'versao' => ''], ['tipo' => 'imagem', 'storage_key' => 'a/b.png', 'status' => 'aprovado']] as $body) {
            self::assertSame(422, $this->call('POST', "/admin/exercicios/$exercise/midias", $body, null, true, $this->linker)['status'], json_encode($body) ?: '');
        }
        $sameFile = $this->link($other, 'ex/remada/v1.mp4');
        self::assertSame(422, $sameFile['status'], 'o mesmo arquivo não vira mídia de outro exercício');
        self::assertArrayHasKey('storage_key', $sameFile['body']['error']['details']['fields']);
        self::assertSame(422, $this->link($exercise, 'ex/remada/outro.mp4')['status'], 'mesmo tipo e versão no mesmo exercício');
        self::assertSame(201, $this->link($exercise, 'ex/remada/v2.mp4', 'video_capi', '2')['status'], 'nova versão é nova mídia');

        self::assertSame(404, $this->link(Uuid::v4(), 'ex/x.mp4')['status']);
        self::assertSame(404, $this->call('POST', '/admin/midias/999999/aprovar', null, null, true, $this->approver)['status']);
        self::assertSame(404, $this->call('POST', '/admin/midias/abc/aprovar', null, null, true, $this->approver)['status']);
    }

    public function testMediaIsOmittedWithoutASigningSecretAndLinkingIsAudited(): void
    {
        $exercise = $this->published('Remada baixa');
        $id = $this->link($exercise, 'ex/remada/v1.mp4')['body']['data']['id'];
        $this->call('POST', "/admin/midias/$id/aprovar", null, null, true, $this->approver);

        $noSecret = $this->makeKernel(['MEDIA_BASE_URL' => 'https://cdn.exemplo.invalid/media', 'MEDIA_SIGNING_SECRET' => '']);
        self::assertSame([], $this->call('GET', "/exercicios/$exercise/midias", null, null, true, null, [], $noSecret)['body']['data'], 'sem segredo, falha fechada');
        self::assertSame(Config::fromArray(['MEDIA_URL_TTL' => '5'])->mediaUrlTtlSeconds, 60, 'validade mínima de 60 s');

        $trail = $this->call('GET', "/admin/auditoria?recurso=midia&recurso_id=$id", null, null, true, $this->approver)['body']['data'];
        self::assertSame(['midia.aprovada', 'midia.vinculada'], array_column($trail, 'acao'));
        $noSecret->db->close();
    }
}
