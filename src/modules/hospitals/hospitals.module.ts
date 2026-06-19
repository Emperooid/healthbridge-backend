import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HospitalsService } from './hospitals.service';
import { HospitalsController } from './hospitals.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule, JwtModule.register({})],
  controllers: [HospitalsController],
  providers: [HospitalsService],
  exports: [HospitalsService],
})
export class HospitalsModule {}
