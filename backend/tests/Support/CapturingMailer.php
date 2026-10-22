<?php

declare(strict_types=1);

namespace CapiFit\Tests\Support;

use CapiFit\Mail\Mailer;

/** Guarda os e-mails em memória para os testes lerem o link com o token. */
final class CapturingMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, body: string}> */
    public array $messages = [];

    public function send(string $to, string $subject, string $textBody): void
    {
        $this->messages[] = ['to' => $to, 'subject' => $subject, 'body' => $textBody];
    }

    /** @return list<array{to: string, subject: string, body: string}> */
    public function to(string $address): array
    {
        return array_values(array_filter($this->messages, static fn (array $m): bool => $m['to'] === $address));
    }

    /** Token do último e-mail enviado ao endereço (parâmetro `token` do link). */
    public function lastToken(string $address): string
    {
        $messages = $this->to($address);
        if ($messages === []) {
            throw new \LogicException("Nenhum e-mail enviado para $address");
        }
        preg_match('/[?&]token=([A-Za-z0-9_-]+)/', $messages[count($messages) - 1]['body'], $m);

        return $m[1] ?? throw new \LogicException('Link com token não encontrado no e-mail.');
    }
}
