import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Our local mirror of a hold created in the dealer's ERP (spec 3.6).
 *
 * The ERP is the source of truth and auto-releases expired holds on its side.
 * We keep this record so the bot can answer "is my stone still held?", so the
 * dealer can see holds the chatbot created, and so a BullMQ job can fire at
 * `expires_at` to follow up with the customer before the stone goes back on
 * the market.
 */
@Entity('holds')
@Index(['tenant_id', 'status'])
export class Hold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @Column({ type: 'varchar', nullable: true })
  conversation_id: string | null;

  /** The hold_id the ERP returned, e.g. "HOLD-88213". */
  @Column()
  erp_hold_id: string;

  @Column()
  diamond_id: string;

  @Column()
  customer_name: string;

  @Column()
  customer_phone: string;

  @Column({ type: 'varchar', nullable: true })
  customer_email: string | null;

  /** 'held' | 'released' | 'expired' | 'converted' */
  @Column({ default: 'held' })
  status: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
