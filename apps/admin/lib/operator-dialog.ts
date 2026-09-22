'use client'

function createDialogShell(title: string, message?: string) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);
  Object.assign(dialog.style, {
    border: '1px solid #d5e8eb',
    borderRadius: '18px',
    padding: '0',
    width: 'min(92vw, 520px)',
    boxShadow: '0 24px 70px rgba(23,50,58,.2)',
  });
  const form = document.createElement('form');
  form.method = 'dialog';
  Object.assign(form.style, { padding: '24px', display: 'grid', gap: '16px', fontFamily: 'system-ui, sans-serif' });
  const heading = document.createElement('h2');
  heading.textContent = title;
  Object.assign(heading.style, { margin: '0', fontSize: '20px', color: '#17323a' });
  form.appendChild(heading);
  if (message) {
    const copy = document.createElement('p');
    copy.textContent = message;
    Object.assign(copy.style, { margin: '0', color: '#38545c', lineHeight: '1.5' });
    form.appendChild(copy);
  }
  dialog.appendChild(form);
  document.body.appendChild(dialog);
  return { dialog, form };
}

function button(label: string, value: string, primary = false) {
  const control = document.createElement('button');
  control.type = 'submit';
  control.value = value;
  control.textContent = label;
  Object.assign(control.style, {
    minHeight: '44px',
    borderRadius: '10px',
    border: primary ? '1px solid #05879a' : '1px solid #b9d8dd',
    padding: '10px 16px',
    fontWeight: '650',
    cursor: 'pointer',
    background: primary ? '#05879a' : '#fff',
    color: primary ? '#fff' : '#17323a',
  });
  return control;
}

export function operatorPrompt(titleOrMessage: string, defaultValue = ''): Promise<string | null> {
  return new Promise(resolve => {
    const { dialog, form } = createDialogShell(titleOrMessage);
    const input = document.createElement('textarea');
    input.value = defaultValue;
    input.rows = 3;
    input.setAttribute('aria-label', titleOrMessage);
    Object.assign(input.style, {
      width: '100%',
      minHeight: '88px',
      border: '1px solid #b9d8dd',
      borderRadius: '10px',
      padding: '10px 12px',
      font: 'inherit',
      resize: 'vertical',
    });
    form.appendChild(input);
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' });
    actions.append(button('Cancel', 'cancel'), button('Continue', 'confirm', true));
    form.appendChild(actions);
    dialog.addEventListener('close', () => {
      const value = dialog.returnValue === 'confirm' ? input.value : null;
      dialog.remove();
      resolve(value);
    }, { once: true });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.close('cancel');
    });
    dialog.showModal();
    input.focus();
    input.select();
  });
}

export function operatorConfirm(message: string, title = 'Confirm action'): Promise<boolean> {
  return new Promise(resolve => {
    const { dialog, form } = createDialogShell(title, message);
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' });
    actions.append(button('Cancel', 'cancel'), button('Confirm', 'confirm', true));
    form.appendChild(actions);
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    }, { once: true });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      dialog.close('cancel');
    });
    dialog.showModal();
  });
}
