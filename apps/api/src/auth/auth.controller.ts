import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, Public, type AuthContext } from './auth.decorators';
import { SESSION_COOKIE, sessionCookieOptions } from './cookie';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) @MaxLength(200) password: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = await this.auth.login(dto.email, dto.password, req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.config.get('isProduction') === true));
    return { ok: true };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = req.headers.cookie
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
      ?.slice(SESSION_COOKIE.length + 1);

    if (token) await this.auth.logout(decodeURIComponent(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /** Who am I — the admin SPA calls this on load to restore its session. */
  @Get('me')
  me(@CurrentUser() user: AuthContext): AuthContext {
    return user;
  }
}
