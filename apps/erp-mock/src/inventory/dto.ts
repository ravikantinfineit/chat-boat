import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Spec 3.2 — every search parameter is optional. */
export class SearchQueryDto {
  @IsOptional() @IsString() shape?: string;
  @IsOptional() @Type(() => Number) @IsNumber() carat_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() carat_max?: number;
  @IsOptional() @IsString() color_min?: string;
  @IsOptional() @IsString() color_max?: string;
  @IsOptional() @IsString() clarity_min?: string;
  @IsOptional() @Type(() => Number) @IsNumber() price_min?: number;
  @IsOptional() @Type(() => Number) @IsNumber() price_max?: number;
  @IsOptional() @IsString() cut?: string;
  @IsOptional() @IsString() diamond_type?: string;
  @IsOptional() @IsString() stock_status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

/** Spec 3.5 */
export class CompareDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) diamond_ids: string[];
}

/** Spec 3.6 */
export class HoldDto {
  @IsString() customer_name: string;
  @IsString() customer_phone: string;
  @IsOptional() @IsString() customer_email?: string;
  @IsOptional() @Type(() => Number) @IsNumber() hold_duration_hours?: number;
  @IsOptional() @IsString() notes?: string;
}

/** Spec 3.7 */
export class ReleaseDto {
  @IsString() hold_id: string;
}

/** Spec 3.8 */
export class QuotationDto {
  @IsString() customer_name: string;
  @IsString() customer_phone: string;
  @IsOptional() @IsString() customer_email?: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) diamond_ids: string[];
  @IsOptional() @Type(() => Number) @IsNumber() valid_for_days?: number;
}

/** Spec 3.9 */
export class OrderDto {
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) diamond_ids: string[];
  @IsString() customer_name: string;
  @IsString() customer_phone: string;
  @IsOptional() @IsString() customer_email?: string;
  @IsString() delivery_address: string;
  @IsOptional() @IsString() quotation_id?: string;
  @IsOptional() @IsString() payment_status?: string;
}
