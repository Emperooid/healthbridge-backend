import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export function setAuthCookies(
  res: any,
  refreshToken: string,
  user: { id: string; email: string; role: string; firstName: string; lastName: string },
  jwtService: JwtService,
  configService: ConfigService,
) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };

  res.cookie('hb_refresh_token', refreshToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });

  const sessionPayload = {
    userId: user.id,
    role: user.role.toLowerCase(),
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const sessionSecret =
    configService.get<string>('session.secret') ||
    process.env.SESSION_SECRET ||
    'healthbridge-dev-secret-key-change-in-production';
  const sessionToken = jwtService.sign(sessionPayload, {
    secret: sessionSecret,
    expiresIn: '7d',
  });
  res.cookie('hb_session', sessionToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: any) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };
  res.clearCookie('hb_refresh_token', cookieOpts);
  res.clearCookie('hb_session', cookieOpts);
}
