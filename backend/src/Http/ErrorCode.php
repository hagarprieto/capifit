<?php

declare(strict_types=1);

namespace CapiFit\Http;

/**
 * Códigos de erro estáveis do contrato. Devem ser idênticos ao enum `ErrorCode`
 * de docs/07_openapi.yaml (verificado por tests/Unit/OpenApiContractTest).
 */
enum ErrorCode: string
{
    case InvalidJson = 'INVALID_JSON';
    case Unauthenticated = 'UNAUTHENTICATED';
    case Forbidden = 'FORBIDDEN';
    case ResourceNotFound = 'RESOURCE_NOT_FOUND';
    case ProgramVersionConflict = 'PROGRAM_VERSION_CONFLICT';
    case VersionImmutable = 'VERSION_IMMUTABLE';
    case RevisionConflict = 'REVISION_CONFLICT';
    case EmailAlreadyRegistered = 'EMAIL_ALREADY_REGISTERED';
    case SessionAlreadyOpen = 'SESSION_ALREADY_OPEN';
    case SessionClosed = 'SESSION_CLOSED';
    case IdempotencyKeyReused = 'IDEMPOTENCY_KEY_REUSED';
    case PrescriptionNotPending = 'PRESCRIPTION_NOT_PENDING';
    case CoachNotVerified = 'COACH_NOT_VERIFIED';
    case ConsentRequired = 'CONSENT_REQUIRED';
    case UnderageNotAllowed = 'UNDERAGE_NOT_ALLOWED';
    case ValidationError = 'VALIDATION_ERROR';
    case RateLimited = 'RATE_LIMITED';
    case NotImplemented = 'NOT_IMPLEMENTED';
    case InternalError = 'INTERNAL_ERROR';
    case ServiceUnavailable = 'SERVICE_UNAVAILABLE';

    public function status(): int
    {
        return match ($this) {
            self::InvalidJson => 400,
            self::Unauthenticated => 401,
            self::Forbidden, self::CoachNotVerified, self::ConsentRequired => 403,
            self::ResourceNotFound => 404,
            self::ProgramVersionConflict, self::VersionImmutable, self::RevisionConflict,
            self::EmailAlreadyRegistered, self::SessionAlreadyOpen, self::SessionClosed, self::IdempotencyKeyReused,
            self::PrescriptionNotPending => 409,
            self::UnderageNotAllowed, self::ValidationError => 422,
            self::RateLimited => 429,
            self::InternalError => 500,
            self::NotImplemented => 501,
            self::ServiceUnavailable => 503,
        };
    }

    public function defaultMessage(): string
    {
        return match ($this) {
            self::InvalidJson => 'Requisição inválida. Verifique o formato dos dados enviados.',
            self::Unauthenticated => 'Autenticação necessária ou expirada.',
            self::Forbidden => 'Você não tem permissão para esta ação.',
            self::ResourceNotFound => 'Recurso não encontrado.',
            self::ProgramVersionConflict => 'A versão do programa foi alterada. Atualize os dados.',
            self::VersionImmutable => 'Esta versão já foi publicada e não pode ser alterada. Crie uma nova versão.',
            self::RevisionConflict => 'Os dados foram alterados por outra operação. Atualize e tente de novo.',
            self::EmailAlreadyRegistered => 'Este e-mail já está cadastrado.',
            self::SessionAlreadyOpen => 'Você já tem um treino em andamento.',
            self::SessionClosed => 'Este treino já foi encerrado e não pode mais ser alterado.',
            self::IdempotencyKeyReused => 'Esta chave de idempotência já foi usada com outro conteúdo.',
            self::PrescriptionNotPending => 'Esta prescrição não está mais pendente.',
            self::CoachNotVerified => 'O profissional ainda não foi verificado.',
            self::ConsentRequired => 'É necessário o consentimento do titular para esta ação.',
            self::UnderageNotAllowed => 'O cadastro é permitido apenas para maiores de 18 anos.',
            self::ValidationError => 'Alguns dados são inválidos.',
            self::RateLimited => 'Muitas requisições. Tente novamente em instantes.',
            self::NotImplemented => 'Funcionalidade ainda não disponível.',
            self::InternalError => 'Ocorreu um erro inesperado. Seus dados não foram alterados por esta requisição.',
            self::ServiceUnavailable => 'Serviço temporariamente indisponível.',
        };
    }
}
