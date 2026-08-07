import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

/**
 * The showroom's rules for its own assistant.
 *
 * Every length limit here is a cost control, not a style preference. This text
 * lands in the prompt's uncached tail and is re-sent on every tool iteration —
 * up to eight per customer message — so a 600-token persona costs roughly 4,800
 * tokens per turn. The caps keep an enthusiastic paste from quietly multiplying
 * a showroom's bill.
 */
export class UpdateAgentRulesDto {
  @IsOptional() @IsString() @MaxLength(1500) agent_persona?: string;
  @IsOptional() @IsString() @MaxLength(200) agent_tone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  guardrails?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  escalation_rules?: string[];

  @IsOptional() @IsString() @MaxLength(300) escalation_contact?: string;

  @IsOptional() @IsBoolean() allow_holds?: boolean;
  @IsOptional() @IsBoolean() allow_quotes?: boolean;
  @IsOptional() @IsBoolean() allow_orders?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(720) max_hold_hours?: number;
}

/** Retention and the widget allowlist — the settings with legal weight. */
export class UpdatePrivacyDto {
  /** 30 days to 7 years. Below a month makes the assistant forget live customers. */
  @IsOptional() @IsInt() @Min(30) @Max(2555) retention_days?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  allowed_origins?: string[];

  @IsOptional() @IsInt() @Min(1) @Max(1000000) daily_message_cap?: number | null;
  @IsOptional() @IsInt() @Min(1000) monthly_token_budget?: number | null;
}
