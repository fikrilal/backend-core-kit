import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../app/ports/password-hasher';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, { algorithm: Algorithm.Argon2id });
  }

  async verify(hashValue: string, password: string): Promise<boolean> {
    return verify(hashValue, password);
  }
}
