import { useLazyQuery } from '@apollo/react-hooks';
import gql from 'graphql-tag';
import { useEffect, useState } from 'react';
import { createContainer } from 'unstated-next';

import { history } from '../lib/history';
import { clearLocalToken, getLocalToken, setLocalToken } from '../lib/localStorage';

type AuthStatus = 'signingIn' | 'signedIn' | 'signedOut' | 'verifying';

const loginQuery = gql`
query($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    accessToken
  }
}`;

const verifyToken = gql`
  query verifyToken($accessToken: String!) {
    verifyToken(accessToken: $accessToken)
  }
`;

const useAuth = () => {
  const [loginFunc, { data: loginData, error: loginError, loading: loginLoading }] = useLazyQuery<
    { login: { accessToken: string } },
    { email: string, password: string }>(loginQuery);

  const [verifyQuery, { data: verifyData }] = useLazyQuery<{ verifyToken: boolean }>(verifyToken);
  const [status, setStatus] = useState<AuthStatus>('signingIn');
  const [checked, setChecked] = useState<boolean>(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  const signOut = () => {
    clearLocalToken();
    setChecked(true);
    setStatus('signedOut');
  };

  const login = (email: string, password: string, redirect?: string) => {
    if (redirect) setRedirect(redirect);
    loginFunc({ variables: { email, password } });
  };

  const loginDone = (token: string) => {
    setLocalToken(token);
    setChecked(true);
    setStatus('signedIn');
    if (redirect) {
      history.push(redirect);
      setRedirect(null);
    }
  };
  useEffect(() => loginData && loginDone(loginData.login.accessToken), [loginData]);


  const verify = async () => {
    if (checked) return;
    setStatus('signingIn');
    const accessToken = getLocalToken();
    if (accessToken) verifyQuery({ variables: { accessToken } });
    else signOut();
  };

  useEffect(() => { verify(); }, []);


  useEffect(() => {
    if (verifyData) {
      if (verifyData.verifyToken) loginDone(getLocalToken()!);
      else signOut();
    }
  }, [verifyData]);


  return {
    status,
    checked,
    verify,
    login,
    loginError,
    loginLoading,
    signOut
  };
};

export const Auth = createContainer(useAuth);
