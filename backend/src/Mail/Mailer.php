<?php

declare(strict_types=1);

namespace CapiFit\Mail;

/**
 * Envio de e-mail transacional (recuperação de senha, verificação de e-mail).
 * Implementações NUNCA registram o corpo nem o destinatário em log: o corpo contém um link com token.
 */
interface Mailer
{
    public function send(string $to, string $subject, string $textBody): void;
}
