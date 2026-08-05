import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';

/**
 * One turn of the conversation, stored in the Claude wire format so a
 * conversation can be replayed to the model verbatim on the next message.
 *
 * `content` holds the full content-block array (text + tool_use + tool_result),
 * not just the visible text — dropping the tool blocks would break the model's
 * view of what it already looked up.
 */
@Entity('chat_messages')
@Index(['conversation_id', 'created_at'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  conversation_id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ type: 'varchar' })
  role: 'user' | 'assistant';

  @Column({ type: 'jsonb' })
  content: unknown;

  @Column({ type: 'int', nullable: true })
  input_tokens: number | null;

  @Column({ type: 'int', nullable: true })
  output_tokens: number | null;

  @CreateDateColumn()
  created_at: Date;
}
