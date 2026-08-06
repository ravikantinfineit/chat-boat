import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';

/**
 * The admin API keeps the spec's snake_case wire style; the service layer maps
 * it onto the camelCase Prisma model.
 */
export class CreateTenantDto {
  @IsString() @MaxLength(200) name: string;
  @IsUrl({ require_tld: false }) erp_base_url: string;
  @IsString() erp_api_key: string;
  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) erp_rate_limit_per_minute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) default_hold_hours?: number;
  @IsOptional() @IsString() @MaxLength(5000) brand_instructions?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsUrl({ require_tld: false }) erp_base_url?: string;
  /** Omit to keep the stored key. */
  @IsOptional() @IsString() erp_api_key?: string;
  @IsOptional() @IsString() company_id?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) erp_rate_limit_per_minute?: number;
  @IsOptional() @IsInt() @Min(1) @Max(720) default_hold_hours?: number;
  @IsOptional() @IsString() @MaxLength(5000) brand_instructions?: string;
}
