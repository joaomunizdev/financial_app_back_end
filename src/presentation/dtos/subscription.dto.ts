import {
  IsUUID,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  IsNumberString,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID() creditCardId!: string;
  @IsUUID() tenantId!: string;
  @IsString() @Length(1, 180) description!: string;
  @IsNumberString() amount!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSubscriptionDto {
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsString() @Length(1, 180) description?: string;
  @IsOptional() @IsNumberString() amount?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
