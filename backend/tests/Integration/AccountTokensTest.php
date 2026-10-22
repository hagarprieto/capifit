<?php

declare(strict_types=1);

namespace CapiFit\Tests\Integration;

use CapiFit\Mail\Mailer;

/** Recuperação de senha e verificação de e-mail (E01-03; CT-02). */
final class AccountTokensTest extends ApiTestCase
{
    private const NEW_PASSWORD = 'nova-senha-bem-longa-77';

    /** @return array{status: int, body: array<string, mixed>, headers: array<string, string>} */
    private function forgot(string $email): array
    {
        return $this->call('POST', '/auth/password/forgot', ['email' => $email], null, false);
    }

    /** @return array{status: int, body: array<string, mixed>, headers: array<string, string>} */
    private function resetWith(string $token, string $password = self::NEW_PASSWORD): array
    {
        return $this->call('POST', '/auth/password/reset', ['token' => $token, 'nova_senha' => $password], null, false);
    }

    private function userId(): int
    {
        return (int) $this->kernel->db->fetchOne('SELECT id FROM usuarios WHERE uuid = ?', 's', $this->userUuid)['id'];
    }

    // ------------------------------------------------------------------------------- verificação de e-mail

    public function testRegistrationSendsAVerificationLinkThatConfirmsTheEmailOnce(): void
    {
        $messages = $this->mailer->to($this->userEmail);
        self::assertCount(1, $messages);
        self::assertStringContainsString('Confirme seu e-mail', $messages[0]['subject']);
        self::assertStringStartsWith('capifit://verificar-email?token=', trim(explode("\n", $messages[0]['body'])[4]));
        $token = $this->mailer->lastToken($this->userEmail);

        self::assertFalse($this->call('GET', '/me')['body']['data']['email_verificado']);
        $ok = $this->call('POST', '/auth/email/verify', ['token' => $token], null, false);
        self::assertSame(204, $ok['status']);
        self::assertSame([], $ok['body']);
        self::assertTrue($this->call('GET', '/me')['body']['data']['email_verificado']);

        $again = $this->call('POST', '/auth/email/verify', ['token' => $token], null, false);
        self::assertSame(422, $again['status'], 'o token só vale uma vez');
        self::assertArrayHasKey('token', $again['body']['error']['details']['fields']);
    }

    public function testInvalidExpiredAndWrongTypeVerificationTokensAreRejectedTheSameWay(): void
    {
        $errors = [];
        foreach ([str_repeat('a', 43), 'curto'] as $bad) {
            $errors[] = $this->call('POST', '/auth/email/verify', ['token' => $bad], null, false);
        }

        $token = $this->mailer->lastToken($this->userEmail);
        $this->kernel->db->execute('UPDATE tokens_acao SET expira_em = DATE_SUB(NOW(6), INTERVAL 1 MINUTE) WHERE usuario_id = ?', 'i', $this->userId());
        $errors[] = $this->call('POST', '/auth/email/verify', ['token' => $token], null, false);

        $this->forgot($this->userEmail);
        $errors[] = $this->call('POST', '/auth/email/verify', ['token' => $this->mailer->lastToken($this->userEmail)], null, false);

        foreach ($errors as $e) {
            self::assertSame(422, $e['status']);
        }
        self::assertSame($errors[0]['body']['error']['details'], $errors[2]['body']['error']['details'], 'expirado e inexistente respondem igual');
        self::assertFalse($this->call('GET', '/me')['body']['data']['email_verificado']);
    }

    public function testAMailerFailureDoesNotBreakRegistrationAndNothingSensitiveIsLogged(): void
    {
        $failing = new class () implements Mailer {
            public function send(string $to, string $subject, string $textBody): void
            {
                throw new \RuntimeException('smtp caiu para ' . $to . ' com ' . $textBody);
            }
        };
        $kernel = $this->makeKernel([], $failing);

        [, , $email] = $this->newUser($kernel);

        $everything = json_encode(array_map(static fn ($r) => [$r->message, $r->context], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString($email, $everything);
        self::assertStringNotContainsString('smtp caiu', $everything);
        self::assertStringNotContainsString('token=', $everything);
        self::assertContains('mail.failed', array_map(static fn ($r) => $r->context['event'] ?? null, $this->logs->getRecords()));
        $kernel->db->close();
    }

    // ------------------------------------------------------------------------------- recuperação de senha

    public function testForgotPasswordAnswersTheSameForKnownUnknownAndSuspendedAccounts(): void
    {
        $unknown = 'ninguem' . bin2hex(random_bytes(4)) . '@exemplo.invalid';
        $suspended = $this->newUser();
        $this->kernel->db->execute("UPDATE usuarios SET estado = 'suspenso' WHERE uuid = ?", 's', $suspended[1]);
        $before = count($this->mailer->messages);

        $known = $this->forgot($this->userEmail);
        $none = $this->forgot($unknown);
        $susp = $this->forgot($suspended[2]);

        foreach ([$known, $none, $susp] as $r) {
            self::assertSame(204, $r['status']);
            self::assertSame([], $r['body']);
        }
        self::assertSame($before + 1, count($this->mailer->messages), 'só a conta ativa recebe e-mail');
        self::assertCount(0, $this->mailer->to($unknown));
        self::assertCount(0, array_filter($this->mailer->to($suspended[2]), static fn (array $m): bool => str_contains($m['subject'], 'Redefinição')));

        $invalid = $this->forgot('sem-arroba');
        self::assertSame(422, $invalid['status']);
    }

    public function testResetChangesThePasswordRevokesEverySessionAndVerifiesTheEmail(): void
    {
        $oldRefresh = $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => 'senha-de-teste-bem-longa-42'], null, false)['body']['data']['refresh_token'];
        $this->forgot($this->userEmail);
        $message = $this->mailer->to($this->userEmail)[1];
        self::assertStringContainsString('Redefinição de senha', $message['subject']);
        $token = $this->mailer->lastToken($this->userEmail);

        $done = $this->resetWith($token);

        self::assertSame(204, $done['status']);
        self::assertSame(200, $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => self::NEW_PASSWORD], null, false)['status']);
        self::assertSame(401, $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => 'senha-de-teste-bem-longa-42'], null, false)['status'], 'a senha antiga deixou de valer');
        self::assertSame(401, $this->call('GET', '/me')['status'], 'o access token anterior foi revogado');
        self::assertSame(401, $this->call('POST', '/auth/refresh', ['refresh_token' => $oldRefresh], null, false)['status'], 'os refresh tokens anteriores também');

        $newToken = $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => self::NEW_PASSWORD], null, false)['body']['data']['access_token'];
        self::assertTrue($this->call('GET', '/me', null, null, true, $newToken)['body']['data']['email_verificado'], 'receber o link comprova o e-mail');
    }

    public function testResetTokenIsSingleUseAndANewRequestInvalidatesTheOldOne(): void
    {
        $this->forgot($this->userEmail);
        $first = $this->mailer->lastToken($this->userEmail);
        $this->forgot($this->userEmail);
        $second = $this->mailer->lastToken($this->userEmail);
        self::assertNotSame($first, $second);

        self::assertSame(422, $this->resetWith($first)['status'], 'o link anterior foi invalidado pelo pedido mais novo');
        self::assertSame(204, $this->resetWith($second)['status']);
        self::assertSame(422, $this->resetWith($second, 'outra-senha-bem-longa-88')['status'], 'uso único');
    }

    public function testAWeakPasswordDoesNotBurnTheToken(): void
    {
        $this->forgot($this->userEmail);
        $token = $this->mailer->lastToken($this->userEmail);

        $short = $this->resetWith($token, 'curta');
        self::assertSame(422, $short['status']);
        self::assertArrayHasKey('nova_senha', $short['body']['error']['details']['fields']);
        $sameAsEmail = $this->resetWith($token, $this->userEmail);
        self::assertSame(422, $sameAsEmail['status']);
        self::assertArrayHasKey('nova_senha', $sameAsEmail['body']['error']['details']['fields']);

        self::assertSame(204, $this->resetWith($token)['status'], 'o token continuou válido depois das tentativas inválidas');
    }

    public function testExpiredOrUnknownResetTokensAreRejected(): void
    {
        $this->forgot($this->userEmail);
        $token = $this->mailer->lastToken($this->userEmail);
        $this->kernel->db->execute("UPDATE tokens_acao SET expira_em = DATE_SUB(NOW(6), INTERVAL 1 SECOND) WHERE usuario_id = ? AND tipo = 'recuperacao_senha'", 'i', $this->userId());

        self::assertSame(422, $this->resetWith($token)['status']);
        self::assertSame(422, $this->resetWith(str_repeat('b', 43))['status']);
        self::assertSame(422, $this->call('POST', '/auth/password/reset', ['token' => $token], null, false)['status'], 'faltou nova_senha');
        self::assertSame(200, $this->call('POST', '/auth/login', ['email' => $this->userEmail, 'senha' => 'senha-de-teste-bem-longa-42'], null, false)['status'], 'a senha não mudou');
    }

    public function testSuspendedAccountCannotResetItsPassword(): void
    {
        $this->forgot($this->userEmail);
        $token = $this->mailer->lastToken($this->userEmail);
        $this->kernel->db->execute("UPDATE usuarios SET estado = 'suspenso' WHERE uuid = ?", 's', $this->userUuid);

        self::assertSame(422, $this->resetWith($token)['status']);
    }

    // ------------------------------------------------------------------------------- armazenamento e limites

    public function testOnlyHashesAreStoredWithTheExpectedLifetimes(): void
    {
        $this->forgot($this->userEmail);
        $reset = $this->mailer->lastToken($this->userEmail);

        $rows = $this->kernel->db->fetchAll(
            'SELECT tipo, token_hash, TIMESTAMPDIFF(MINUTE, NOW(6), expira_em) AS minutos FROM tokens_acao WHERE usuario_id = ? AND usado_em IS NULL ORDER BY tipo',
            'i',
            $this->userId(),
        );
        self::assertCount(2, $rows);
        $byType = array_column($rows, null, 'tipo');
        self::assertSame(hash('sha256', $reset), $byType['recuperacao_senha']['token_hash']);
        self::assertEqualsWithDelta(60, (int) $byType['recuperacao_senha']['minutos'], 1, 'recuperação vale 1 hora');
        self::assertEqualsWithDelta(1440, (int) $byType['verificacao_email']['minutos'], 1, 'verificação vale 24 horas');
        self::assertNotSame($reset, $byType['recuperacao_senha']['token_hash']);
    }

    public function testNoTokenOrLinkReachesTheLogs(): void
    {
        $this->forgot($this->userEmail);
        $reset = $this->mailer->lastToken($this->userEmail);
        $this->resetWith($reset);

        $everything = json_encode(array_map(static fn ($r) => [$r->message, $r->context, $r->extra], $this->logs->getRecords()), JSON_THROW_ON_ERROR);
        self::assertStringNotContainsString($reset, $everything);
        self::assertStringNotContainsString('redefinir-senha', $everything);
        self::assertStringNotContainsString(self::NEW_PASSWORD, $everything);
    }

    public function testForgotPasswordIsLimitedPerEmailWithoutRevealingTheAccount(): void
    {
        $limited = $this->makeKernel(['RATE_LIMIT_ENABLED' => '1']);
        $run = function (string $email) use ($limited): array {
            $statuses = [];
            for ($i = 1; $i <= 4; $i++) {
                // IP diferente a cada pedido: só o limite por e-mail pode barrar.
                $ip = '198.18.' . random_int(0, 255) . '.' . random_int(1, 254);
                $statuses[] = $this->call('POST', '/auth/password/forgot', ['email' => $email], null, false, null, [], $limited, ['REMOTE_ADDR' => $ip])['status'];
            }

            return $statuses;
        };

        $known = $run($this->userEmail);
        $unknown = $run('x' . bin2hex(random_bytes(4)) . '@exemplo.invalid');

        self::assertSame([204, 204, 204, 429], $known, 'no máximo 3 pedidos por hora para o mesmo e-mail');
        self::assertSame($known, $unknown, 'conta inexistente é limitada do mesmo jeito');
        $limited->db->close();
    }

    public function testUnknownFieldsAreRejected(): void
    {
        self::assertSame(422, $this->call('POST', '/auth/password/forgot', ['email' => $this->userEmail, 'admin' => true], null, false)['status']);
        self::assertSame(422, $this->call('POST', '/auth/email/verify', ['token' => str_repeat('a', 43), 'x' => 1], null, false)['status']);
    }
}
