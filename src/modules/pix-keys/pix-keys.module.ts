import { Module } from '@nestjs/common';
import { PixKeysService } from './pix-keys.service';
import { PixKeysController } from './pix-keys.controller';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AccountsModule],
  controllers: [PixKeysController],
  providers: [PixKeysService],
  exports: [PixKeysService],
})
export class PixKeysModule {}
