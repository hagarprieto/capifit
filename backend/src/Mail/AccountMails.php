<?php

declare(strict_types=1);

namespace CapiFit\Mail;

/** Textos dos e-mails de conta (pt-BR). O link leva o token como parâmetro de consulta. */
final class AccountMails
{
    /** @return array{string, string} assunto e corpo */
    public static function passwordReset(string $name, string $baseUrl, string $token): array
    {
        return [
            'Redefinição de senha — CapiFit',
            "Olá, {$name}!\n\nRecebemos um pedido para redefinir a senha da sua conta no CapiFit.\n"
            . 'Para escolher uma nova senha, abra o link abaixo (vale por 1 hora e só pode ser usado uma vez):' . "\n\n"
            . self::link($baseUrl, $token) . "\n\n"
            . "Se não foi você, ignore este e-mail: sua senha continua a mesma.\n",
        ];
    }

    /** @return array{string, string} assunto e corpo */
    public static function emailVerification(string $name, string $baseUrl, string $token): array
    {
        return [
            'Confirme seu e-mail — CapiFit',
            "Olá, {$name}!\n\nBem-vindo ao CapiFit. Para confirmar o seu e-mail, abra o link abaixo (vale por 24 horas):\n\n"
            . self::link($baseUrl, $token) . "\n\n"
            . "Se você não criou uma conta, ignore este e-mail.\n",
        ];
    }

    private static function link(string $baseUrl, string $token): string
    {
        return $baseUrl . (str_contains($baseUrl, '?') ? '&' : '?') . 'token=' . rawurlencode($token);
    }
}
