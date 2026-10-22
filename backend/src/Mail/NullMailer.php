<?php

declare(strict_types=1);

namespace CapiFit\Mail;

use Psr\Log\LoggerInterface;

/**
 * Padrão enquanto não há provedor de e-mail (a escolha depende da hospedagem — Doc 12 §8).
 * Não envia nada e deixa um aviso sem destinatário nem conteúdo, para que a falta de envio não passe despercebida.
 */
final class NullMailer implements Mailer
{
    public function __construct(private readonly LoggerInterface $logger)
    {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        $this->logger->warning('E-mail não enviado: nenhum provedor configurado', ['event' => 'mail.not_sent']);
    }
}
