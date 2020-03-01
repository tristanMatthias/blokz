import { useLazyQuery } from '@apollo/react-hooks';
import gql from 'graphql-tag';
import { useEffect } from 'react';
import { createContainer } from 'unstated-next';
import { Auth } from './Auth.container';

import { BrixContextUser } from '@brix/core';

const meQuery = gql`{
  me {
    firstName
    lastName
    id
    email
  }
}`;

const useAuth = () => {
  const { status } = Auth.useContainer();
  const [getMe, { data, error, loading, called }] = useLazyQuery<{ me: BrixContextUser }>(meQuery, {});

  useEffect(() => {
    status === 'signedIn' && getMe();
  }, [status]);

  return {
    me: data ? data.me : undefined,
    loading,
    called,
    error
  };
};

export const Me = createContainer(useAuth);
