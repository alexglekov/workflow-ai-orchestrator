import { Controller, Get } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  @Get('status')
  status() {
    return { required: Boolean(process.env.API_PASSWORD?.trim()) };
  }
}
