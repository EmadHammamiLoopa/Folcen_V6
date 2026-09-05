import { FormBuilder } from '@angular/forms';

import { SignupComponent } from './signup.component';

describe('SignupComponent', () => {
  it('should create', () => {
    const component = new SignupComponent(
      {} as any,
      {} as any,
      {} as any,
      new FormBuilder(),
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );

    component.initializeForm();

    expect(component).toBeTruthy();
    expect(component.form).toBeTruthy();
    expect(component.form.get('email')).toBeTruthy();
    expect(component.form.get('password')).toBeTruthy();
    expect(component.form.get('acceptedTerms')).toBeTruthy();
  });
});
