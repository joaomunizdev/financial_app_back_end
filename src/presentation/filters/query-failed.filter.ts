import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

// PostgreSQL SQLSTATE codes mapped to client errors.
const PG_ERRORS: Record<string, { status: HttpStatus; message: string }> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    message: 'Resource already exists',
  },
  '23503': {
    status: HttpStatus.CONFLICT,
    message: 'Resource is referenced by other records',
  },
  '22P02': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Invalid identifier or value format',
  },
  '22003': {
    status: HttpStatus.BAD_REQUEST,
    message: 'Numeric value out of range',
  },
};

/** Turns database constraint errors into 4xx responses without leaking SQL details. */
@Catch(QueryFailedError)
export class QueryFailedFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const code = (exception.driverError as { code?: string } | undefined)?.code;
    const known = code ? PG_ERRORS[code] : undefined;

    if (!known) {
      this.logger.error(`Unhandled database error (code ${code ?? 'n/a'})`, exception.stack);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    res.status(known.status).json({
      statusCode: known.status,
      message: known.message,
    });
  }
}
