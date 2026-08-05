import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One dealer / showroom group. Everything the admin panel's "Connect Your
 * System" screen collects lives here.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  /**
   * Public key embedded in the website widget. Safe to expose — it only
   * identifies which tenant a chat belongs to and never reaches the ERP.
   */
  @Column({ unique: true })
  widget_key: string;

  /** Base URL of the dealer's ERP, e.g. https://erp.example.com */
  @Column()
  erp_base_url: string;

  /**
   * The dealer's API key, sent as `Authorization: Bearer <key>` (spec 3.1).
   * Encrypted at rest with APP_SECRET; never returned by the admin API.
   */
  @Column({ type: 'text' })
  erp_api_key_encrypted: string;

  /** Sent as `X-Company-ID` so multi-branch ERPs know which showroom. */
  @Column({ type: 'varchar', nullable: true })
  company_id: string | null;

  /**
   * Shared secret the ERP signs inventory webhooks with (spec 3.11). We hand
   * this to the dealer alongside the webhook URL.
   */
  @Column()
  webhook_secret: string;

  /**
   * Spec 6 recommends rate limiting the search endpoint (~60 req/min). We honour
   * whatever the dealer configures so we never overload their database.
   */
  @Column({ type: 'int', default: 60 })
  erp_rate_limit_per_minute: number;

  /** Default hold window offered to customers, in hours (spec 3.6). */
  @Column({ type: 'int', default: 24 })
  default_hold_hours: number;

  /** Extra sales guidance appended to the system prompt. */
  @Column({ type: 'text', nullable: true })
  brand_instructions: string | null;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
