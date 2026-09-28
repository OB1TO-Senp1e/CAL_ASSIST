import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AccountDeletionService } from './account-deletion.service';
import { PrismaService } from '../common/services/prisma.service';
import { CalendarAdaptersModule } from '../integrations/calendar-adapters/calendar-adapters.module';

@Module({
  // forwardRef: CalendarAdaptersModule -> AuthModule -> UsersModule is a cycle;
  // account deletion reuses CalendarConnectionService.disconnect() (C3 revoke
  // first) rather than duplicating provider revoke logic.
  imports: [forwardRef(() => CalendarAdaptersModule)],
  controllers: [UsersController],
  providers: [UsersService, AccountDeletionService, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
