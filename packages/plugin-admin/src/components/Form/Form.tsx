import './form.scss';

import classnames from 'classnames';
import { Form as FormikForm, FormikConfig, FormikContextType, FormikProvider, useFormik } from 'formik';
import React, { PropsWithoutRef, useEffect } from 'react';

import { FormStatus } from '../FormStatus/FormStatus';

export interface FormProps<Values extends object> extends
  Partial<FormikConfig<Values>>,
  PropsWithoutRef<HTMLFormElement> {
  onChange?: (values: Values, formikHelpers: FormikContextType<Values>) => void;
  setForm?(form: FormikContextType<Values>): void;
  error?: string;
  success?: string;
}


// Brix Form context and hooks
export interface BrixFormContext {
  onChange: (values: any, formik: FormikContextType<any>) => any;
}
const BrixFormContext = React.createContext<BrixFormContext>({} as any);
export const useBrixFormContext = () => React.useContext<BrixFormContext>(BrixFormContext);

export const Form: React.FunctionComponent<FormProps<any>> = ({
  onChange,
  children,
  withSubmit,
  className,
  onSubmit = () => { },
  initialValues = {},
  style,
  setForm,
  error,
  success,
  ...formikProps
}) => {

  // Establishes the context for FormField to call onChange
  const ctx: BrixFormContext = {
    onChange: (e, formik) => {
      if (onChange) onChange(e, formik);
    }
  };

  const form = useFormik({
    onSubmit,
    initialValues,
    enableReinitialize: true,
    ...formikProps
  });

  useEffect(() => {
    if (setForm) setForm(form);
  }, [form.values, form.errors, form.touched]);

  const canSubmit = form.dirty && withSubmit;

  return <BrixFormContext.Provider value={ctx}>
    <FormikProvider value={form}>
      {(error || success) &&
        <FormStatus error={Boolean(error)}>{error || success}</FormStatus>
      }
      <FormikForm children={children} className={classnames(className, { 'with-submit': canSubmit })} style={style} />
    </FormikProvider>
  </BrixFormContext.Provider>;
};
