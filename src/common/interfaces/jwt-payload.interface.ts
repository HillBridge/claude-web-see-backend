export interface IJwtPayload {
  sub: number;
  username: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}
