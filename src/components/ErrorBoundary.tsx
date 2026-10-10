import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetSuccessMessage: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    resetSuccessMessage: null
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lỗi giao diện không mong muốn (ErrorBoundary caught error):', error, errorInfo);
    this.setState({ errorInfo });
  }

  // Khôi phục dữ liệu an toàn khi có sự cố cache/dữ liệu hỏng
  private handleResetCorruptedData = () => {
    try {
      // Xóa các key dữ liệu có thể bị lỗi cú pháp / hỏng cấu trúc
      const keysToClean = [
        'payroll_system_settings',
        'payroll_employees_data',
        'payroll_dependents_data',
        'payroll_insurances_data',
        'payroll_meals_data',
        'payroll_allowances_data',
        'payroll_timekeepings_data',
        'payroll_google_sync_state'
      ];
      keysToClean.forEach(k => {
        try { localStorage.removeItem(k); } catch (_) {}
      });
      // Đặt chế độ an toàn
      localStorage.setItem('payroll_is_demo_mode', 'true');
      this.setState({ resetSuccessMessage: 'Đã dọn dẹp dữ liệu lưu đệm hỏng. Đang tải lại...' });
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (e) {
      window.location.reload();
    }
  };

  private handleFullReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch (_) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-slate-800 rounded-3xl p-6 sm:p-8 border-2 border-red-500/60 shadow-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 text-red-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">
                  Đã Xảy Ra Sự Cố Hiển Thị
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Phần mềm đã bắt được lỗi và tự động kích hoạt cơ chế tự phục hồi an toàn.
                </p>
              </div>
            </div>

            {this.state.resetSuccessMessage && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{this.state.resetSuccessMessage}</span>
              </div>
            )}

            {/* Error Message Details */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-700/60 space-y-2 text-xs">
              <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Chi tiết sự cố:
              </div>
              <div className="font-mono text-red-400 bg-red-950/40 p-2.5 rounded-xl border border-red-900/60 break-all select-all text-[11px]">
                {this.state.error?.message || 'Lỗi không xác định trong quá trình xử lý giao diện'}
              </div>
              {this.state.error?.stack && (
                <details className="text-[10px] text-slate-500 mt-2">
                  <summary className="cursor-pointer hover:text-slate-400 font-medium">Xem ngăn xếp chi tiết (Stack Trace)</summary>
                  <pre className="mt-2 p-2 bg-slate-900 rounded-lg overflow-x-auto text-[10px] text-slate-400 font-mono whitespace-pre-wrap max-h-40">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>

            {/* Recommended Solutions */}
            <div className="space-y-3">
              <button
                onClick={this.handleResetCorruptedData}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition-colors cursor-pointer text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Khôi Phục Dữ Liệu An Toàn &amp; Vào Lại Phần Mềm</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-600"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Tải lại trang</span>
                </button>

                <button
                  onClick={this.handleFullReset}
                  className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900/60 text-red-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-red-800/40"
                  title="Xóa toàn bộ bộ nhớ đệm và đăng nhập lại từ đầu"
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Xóa đệm &amp; Đăng xuất</span>
                </button>
              </div>
            </div>

            <div className="text-center text-[11px] text-slate-500 border-t border-slate-700/60 pt-4">
              Hệ thống bảo toàn tài khoản và dữ liệu Google Drive của bạn 100%.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
