import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { blindIndex, decryptPii, encryptPii } from './pii.util';

/** What the model or a form gave us. */
export interface CustomerDetails {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

/** The column shape written to conversations and holds. */
export interface SealedCustomer {
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerPhoneIndex?: string | null;
  customerEmailIndex?: string | null;
}

/**
 * The one place customer contact details are encrypted and decrypted.
 *
 * Centralised so no caller has to remember that writing a phone number also
 * means writing its blind index — forgetting that is silent, and only shows up
 * later as an erasure request that finds nothing.
 */
@Injectable()
export class PiiService {
  constructor(private readonly config: ConfigService) {}

  private get secret(): string {
    return this.config.getOrThrow<string>('appSecret');
  }

  /** Encrypts what is present and leaves out what is not. */
  seal(details: CustomerDetails): SealedCustomer {
    const sealed: SealedCustomer = {};
    const secret = this.secret;

    if (details.name) sealed.customerName = encryptPii(details.name, secret);
    if (details.phone) {
      sealed.customerPhone = encryptPii(details.phone, secret);
      sealed.customerPhoneIndex = blindIndex(details.phone, secret, 'phone');
    }
    if (details.email) {
      sealed.customerEmail = encryptPii(details.email, secret);
      sealed.customerEmailIndex = blindIndex(details.email, secret, 'email');
    }
    return sealed;
  }

  /**
   * For rows whose name and phone columns are NOT NULL — a hold, which cannot
   * exist without someone to hold it for. Returning them as definitely-present
   * saves every caller a non-null assertion that would be the first thing to go
   * wrong if `seal` ever changed.
   */
  sealRequired(details: { name: string; phone: string; email?: string | null }): SealedCustomer & {
    customerName: string;
    customerPhone: string;
  } {
    const sealed = this.seal(details);
    return {
      ...sealed,
      customerName: sealed.customerName as string,
      customerPhone: sealed.customerPhone as string,
    };
  }

  open(value: string): string;
  open(value: string | null): string | null;
  open(value: string | null): string | null {
    return value === null ? null : decryptPii(value, this.secret);
  }

  /** Turns a search term into the value stored in the indexed column. */
  fingerprint(value: string, kind: 'phone' | 'email'): string {
    return blindIndex(value, this.secret, kind);
  }
}
