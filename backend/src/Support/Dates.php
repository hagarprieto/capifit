<?php

declare(strict_types=1);

namespace CapiFit\Support;

/** Datas do contrato: ISO 8601 em UTC no transporte; DATETIME(6) em UTC no banco (Doc 04 RG-014). */
final class Dates
{
    private const DB_FORMAT = 'Y-m-d H:i:s.u';
    private const FORMATS = ['Y-m-d\TH:i:sP', 'Y-m-d\TH:i:s.uP', 'Y-m-d\TH:i:s.vP'];

    /** Converte "2026-10-21T14:30:00Z" (ou com fração e/ou deslocamento) para UTC; null se inválido. */
    public static function parse(mixed $value): ?\DateTimeImmutable
    {
        if (!is_string($value) || strlen($value) > 40 || preg_match('/^\d{4}-\d{2}-\d{2}T/', $value) !== 1) {
            return null;
        }
        $normalized = preg_replace('/z$/i', '+00:00', $value);
        if (!is_string($normalized)) {
            return null;
        }
        foreach (self::FORMATS as $format) {
            $date = \DateTimeImmutable::createFromFormat('!' . $format, $normalized);
            $errors = \DateTimeImmutable::getLastErrors();
            if ($date !== false && ($errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0))) {
                return $date->setTimezone(new \DateTimeZone('UTC'));
            }
        }

        return null;
    }

    public static function toDb(\DateTimeImmutable $date): string
    {
        return $date->setTimezone(new \DateTimeZone('UTC'))->format(self::DB_FORMAT);
    }

    /** Valor DATETIME(6) do banco (já em UTC) para ISO 8601 com milissegundos e "Z". */
    public static function fromDb(mixed $value): ?string
    {
        if (!is_string($value) || $value === '') {
            return null;
        }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d H:i:s.u', str_contains($value, '.') ? $value : $value . '.000000', new \DateTimeZone('UTC'));

        return $date === false ? null : $date->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function nowUtc(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }
}
