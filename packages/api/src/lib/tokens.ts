import jwt from 'jsonwebtoken';

import { CONFIG } from '../config';
import { Env } from '../config/types';
import { ErrorAuthInvalidToken } from '../errors';
import { User } from '../models/User';
import { CreateUser } from '../services/UserService';

export interface JWTUser extends CreateUser {
  id: string;
}

interface JWTData {
  fingerprint: string;
  user: JWTUser;
  isDevelopment: boolean;
}

export interface TokenResult {
  accessToken: string;
  expiry: number;
}

export interface JWTVerifyResult extends JWTData {
  iat: string;
  exp: number;
}


/**
 * Creates a new access token
 * @param data JWT Data to encrypt (contains the user data)
 * @param expiresIn Time for the JWT to expire
 */
export const createToken = async (
  data: JWTData,
  expiresIn = '15m'
): Promise<{ token: string, expiry: number }> => {
  let expires = expiresIn;
  if (CONFIG.env === Env.development) expires = '7d';
  const token = jwt.sign(data, CONFIG.accessTokenSecret, { expiresIn: expires });
  const expiry = (jwt.decode(token) as JWTVerifyResult).exp;
  return { token, expiry };
};

/**
 * Attempt to verify the token is a valid JWT.
 * If successful, it returns the JWT Data (including the user)
 * @param token JWT to verify
 */
export const verifyToken = async (
  fingerprint: string,
  token: string
): Promise<JWTData> => {

  let data;
  try {
    data = jwt.verify(token, CONFIG.accessTokenSecret) as JWTVerifyResult;
  } catch (e) {
    throw new ErrorAuthInvalidToken();
  }

  // NOTE: Potentially may want to invalidate this JWT too, to prevent it's reuse
  if (data.fingerprint !== fingerprint && !data.isDevelopment) throw new ErrorAuthInvalidToken();

  return data;
};

/**
 * Ggenerate an access token for the current user.
 * @param fingerprint Unique fingerprint of the requesting client
 * @param user User data to encrypt for future requests
 */
export const generateToken = async (
  fingerprint: string,
  user: User | JWTUser
): Promise<TokenResult> => {
  const data: JWTData = {
    fingerprint,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      socialId: user.socialId,
      socialPic: user.socialPic
    },
    isDevelopment: CONFIG.env === Env.development
  };
  const { token: accessToken, expiry } = await createToken(data);
  return { accessToken, expiry };
};
