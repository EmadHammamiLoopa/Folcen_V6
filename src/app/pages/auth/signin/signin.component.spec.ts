import { FormBuilder } from '@angular/forms';
import { SigninComponent } from './signin.component';

describe('SigninComponent', () => {
  it('should create', () => {
    const component = new SigninComponent(
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
      {} as any
    );

    component.ngOnInit();

    expect(component).toBeTruthy();
    expect(component.form).toBeTruthy();
    expect(component.form.get('email')).toBeTruthy();
    expect(component.form.get('password')).toBeTruthy();
  });
});
