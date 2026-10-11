import toast from 'react-hot-toast';

export interface ErrorPopupDetail {
  message: string;
  title?: string;
}

export const showErrorPopup = (message: string, title?: string) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ErrorPopupDetail>('app:show-error-popup', {
        detail: {
          message: message || 'An error occurred. Please try again.',
          title: title || 'Notice'
        }
      })
    );
  }
};

let isInterceptorInitialized = false;

export const initErrorInterceptor = () => {
  if (isInterceptorInitialized || typeof window === 'undefined') return;
  isInterceptorInitialized = true;

  // Intercept react-hot-toast error calls globally
  const originalToastError = toast.error;

  toast.error = (message: any, options?: any) => {
    let msgStr = '';
    if (typeof message === 'string') {
      msgStr = message;
    } else if (message?.message && typeof message.message === 'string') {
      msgStr = message.message;
    } else if (typeof message === 'object') {
      try {
        msgStr = JSON.stringify(message);
      } catch {
        msgStr = 'An unexpected error occurred.';
      }
    } else {
      msgStr = String(message || 'An error occurred.');
    }

    showErrorPopup(msgStr);
    return 'error-popup-handled';
  };
};
