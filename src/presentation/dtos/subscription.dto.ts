import {
  IsIn,
  IsUUID,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { IsMoney } from './money.validator';
import { PageQueryDto } from './pagination.dto';

export class CreateSubscriptionDto {
  @IsUUID() creditCardId!: string;
  @IsUUID() tenantId!: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsString() @Length(1, 180) description!: string;
  @IsMoney() amount!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  /** null clears it. */
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsString() @Length(1, 180) description?: string;
  @IsOptional() @IsMoney() amount?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListSubscriptionsQueryDto extends PageQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
}
