<?php

declare(strict_types=1);

namespace CapiFit\Mail;

/**
 * Só para desenvolvimento local (APP_ENV=local): grava cada e-mail em um arquivo, para abrir o link de teste.
 * O nome do arquivo não inclui o destinatário. A pasta `backend/storage/` é ignorada pelo Git.
 */
final class FileMailer implements Mailer
{
    public function __construct(private readonly string $directory)
    {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new \RuntimeException('Não foi possível criar a pasta de e-mails de desenvolvimento.');
        }
        $name = gmdate('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.txt';
        file_put_contents($this->directory . DIRECTORY_SEPARATOR . $name, "Para: $to\nAssunto: $subject\n\n$textBody\n");
    }
}
