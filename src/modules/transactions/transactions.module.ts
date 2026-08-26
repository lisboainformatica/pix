import { Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { PixKeysModule } from '../pix-keys/pix-keys.module';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [AccountsModule, PixKeysModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, IdempotencyService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
