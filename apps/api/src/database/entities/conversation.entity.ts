import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { ChatMessage } from './message.entity';

@Entity('conversations')
@Index(['tenant_id', 'created_at'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tenant_id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  /** 'web' | 'whatsapp' | … — the channel the customer arrived on. */
  @Column({ default: 'web' })
  channel: string;

  /** Captured during the conversation and reused for holds/quotes/orders. */
  @Column({ type: 'varchar', nullable: true })
  customer_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  customer_phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  customer_email: string | null;

  @OneToMany(() => ChatMessage, (m) => m.conversation)
  messages: ChatMessage[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
