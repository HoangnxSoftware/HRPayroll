import React, { useState, useEffect } from 'react';
import { 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  LogIn, 
  ShieldCheck, 
  Building2, 
  AlertCircle, 
  Sparkles, 
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Folder,
  Database,
  Search,
  Check,
  X,
  AlertOctagon,
  ShieldAlert,
  ArrowLeft,
  AlertTriangle
} from 'lucide-react';
import { useAuthRole } from '../context/AuthRoleContext';
import { SystemSettings, GoogleSyncState } from '../types';
import { googleSignIn, logout, getCurrentUser } from '../services/authService';
import { 
  listDriveSpreadsheets, 
  DriveSpreadsheetItem,
  DriveFolderInfo,
  fetchSpreadsheetDetails,
  extractSpreadsheetId,
  createNewCompanySpreadsheet,
  ensureSpreadsheetInHRSalaryFolder,
  GOOGLE_DRIVE_FOLDER_NAME,
  FullPayrollData
} from '../services/googleSheetsService';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
  settings: SystemSettings;
  syncState: GoogleSyncState;
  setSyncState: React.Dispatch<React.SetStateAction<GoogleSyncState>>;
  onApplyNewCompanyData?: (newData: FullPayrollData, spreadsheetInfo?: { id: string; url: string; title: string }) => void;
  onLoadDataFromSpreadsheet?: (spreadsheetId: string, spreadsheetName?: string) => Promise<boolean>;
  onResetToDemoData?: () => void;
}

// Thông tin lưu trữ đường dẫn file cơ sở dữ liệu đã kết nối
export interface SavedDatabaseInfo {
  id: string;
  name: string;
  url: string;
  savedAt?: string;
}

// Helper: Đọc thông tin file cơ sở dữ liệu đã lưu từ lần thoát/đăng nhập trước đó
export const getSavedDatabaseInfo = (): SavedDatabaseInfo | null => {
  try {
    const raw = localStorage.getItem('payroll_saved_database_info');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && (parsed.url || parsed.name)) {
        return {
          id: parsed.id,
          name: parsed.name || 'Bảng tính Google Sheets',
          url: parsed.url || `https://docs.google.com/spreadsheets/d/${parsed.id}/edit`,
          savedAt: parsed.savedAt
        };
      }
    }
    const savedUrl = localStorage.getItem('payroll_saved_database_url');
    if (savedUrl) {
      const cleanId = extractSpreadsheetId(savedUrl);
      if (cleanId) {
        return {
          id: cleanId,
          name: 'Bảng tính đã kết nối trước đó',
          url: savedUrl
        };
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc saved database info từ localStorage:', e);
  }
  return null;
};

// Helper: Lưu đường dẫn file cơ sở dữ liệu để phục vụ cho lần đăng nhập tiếp theo
export const saveDatabaseConnectionToStorage = (info: { id: string; name?: string | null; url?: string | null }) => {
  try {
    if (!info.id) return;
    const url = info.url || `https://docs.google.com/spreadsheets/d/${info.id}/edit`;
    const payload: SavedDatabaseInfo = {
      id: info.id,
      name: info.name || 'Bảng tính Google Sheets',
      url,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem('payroll_saved_database_info', JSON.stringify(payload));
    localStorage.setItem('payroll_saved_database_url', url);
  } catch (e) {
    console.warn('Lỗi lưu saved database info vào localStorage:', e);
  }
};

export const LoginModal: React.FC<LoginModalProps> = ({ 
  isOpen, 
  onClose, 
  settings,
  syncState,
  setSyncState,
  onApplyNewCompanyData,
  onLoadDataFromSpreadsheet,
  onResetToDemoData
}) => {
  const { login, isAuthenticated, users } = useAuthRole();
  const [activeTab, setActiveTab] = useState<'login' | 'google'>('login');
  
  // Credentials
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Red Warning Confirmation Modal for Demo Data Mode
  const [showDemoWarningModal, setShowDemoWarningModal] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password?: string } | null>(null);

  // Saved database info from previous login/exit
  const savedDb = getSavedDatabaseInfo();

  // Google Drive state: Khởi tạo với spreadsheet hiện tại HOẶC đường dẫn file đã lưu trước đó nếu không ở demo
  const [isGoogleProcessing, setIsGoogleProcessing] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetItem[]>([]);
  const [hrSalaryFolder, setHrSalaryFolder] = useState<DriveFolderInfo | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [customSheetInput, setCustomSheetInput] = useState('');

  const [selectedFileId, setSelectedFileId] = useState<string | null>(() => {
    if (syncState.spreadsheetId) return syncState.spreadsheetId;
    if (!syncState.isDemoMode && savedDb?.id) return savedDb.id;
    return null;
  });
  const [selectedFileName, setSelectedFileName] = useState<string | null>(() => {
    if (syncState.spreadsheetName) return syncState.spreadsheetName;
    if (!syncState.isDemoMode && savedDb?.name) return savedDb.name;
    return null;
  });
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(() => {
    if (syncState.spreadsheetUrl) return syncState.spreadsheetUrl;
    if (!syncState.isDemoMode && savedDb?.url) return savedDb.url;
    return null;
  });

  // Mode for new company creation
  const [showCreateCompanyForm, setShowCreateCompanyForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyTaxCode, setNewCompanyTaxCode] = useState('');
  const [newCompanyDirector, setNewCompanyDirector] = useState('');
  const [newCompanyAccountant, setNewCompanyAccountant] = useState('');
  const [newCompanyAddress, setNewCompanyAddress] = useState('');
  const [newCompanyPhone, setNewCompanyPhone] = useState('');
  const [isPendingNewCompany, setIsPendingNewCompany] = useState<FullPayrollData | null>(null);
  const [newCompanySuccessNotice, setNewCompanySuccessNotice] = useState<string | null>(null);

  // Search filter for Drive files
  const [fileSearchQuery, setFileSearchQuery] = useState('');

  // Load drive files when switching to google tab or when connected
  // ONLY spreadsheets inside the HR-Salary folder will be listed
  const handleLoadDriveFiles = async () => {
    setIsLoadingFiles(true);
    setErrorMessage(null);
    try {
      const { folder, files } = await listDriveSpreadsheets();
      setHrSalaryFolder(folder);
      setDriveFiles(files);
      if (files.length === 0) {
        setErrorMessage(`Thư mục '${folder.name}' trên Google Drive chưa có bảng tính nào. Bảng tính ngoài thư mục này sẽ không hiển thị trong danh sách. Bạn có thể bấm 'Tạo mới cơ sở dữ liệu' để bắt đầu.`);
      }
    } catch (err: any) {
      console.warn('Lỗi khi tải file Google Drive:', err);
      setErrorMessage(`Lỗi khi đọc Google Drive: ${err.message || 'Chưa được cấp quyền'}`);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleProcessing(true);
    setErrorMessage(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setSyncState(prev => ({
          ...prev,
          isConnected: true,
          userEmail: res.user.email,
          syncMessage: 'Đã kết nối tài khoản Google!'
        }));
        setSuccessMessage(`Đã kết nối tài khoản Google: ${res.user.email}`);
        setTimeout(() => setSuccessMessage(null), 3000);
        // Load spreadsheets
        await handleLoadDriveFiles();
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setErrorMessage(`Đăng nhập Google không thành công: ${err.message || 'Lỗi kết nối'}`);
    } finally {
      setIsGoogleProcessing(false);
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setSyncState(prev => ({
        ...prev,
        isConnected: false,
        userEmail: null,
        syncMessage: 'Đã ngắt kết nối tài khoản Google.'
      }));
      setDriveFiles([]);
      setSelectedFileId(null);
      setSelectedFileName(null);
      setSelectedFileUrl(null);
      setSuccessMessage('Đã ngắt kết nối tài khoản Google.');
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err: any) {
      setErrorMessage(`Lỗi khi đăng xuất Google: ${err.message}`);
    }
  };

  // Select an existing spreadsheet from list
  const handleSelectSpreadsheet = (file: DriveSpreadsheetItem) => {
    const fileUrl = file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`;
    setSelectedFileId(file.id);
    setSelectedFileName(file.name);
    setSelectedFileUrl(fileUrl);
    setIsPendingNewCompany(null);
    saveDatabaseConnectionToStorage({ id: file.id, name: file.name, url: fileUrl });
    setSuccessMessage(`Đã chọn bảng tính: ${file.name}`);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  // Connect via direct link or ID
  const handleConnectCustomSheet = async () => {
    if (!customSheetInput.trim()) return;
    setIsGoogleProcessing(true);
    setErrorMessage(null);
    try {
      const cleanId = extractSpreadsheetId(customSheetInput);
      const details = await fetchSpreadsheetDetails(cleanId);
      // Đảm bảo bảng tính được tập trung vào thư mục HR-Salary
      const { folder, moved } = await ensureSpreadsheetInHRSalaryFolder(cleanId);
      setHrSalaryFolder(folder);
      setSelectedFileId(details.id);
      setSelectedFileName(details.title);
      setSelectedFileUrl(details.url);
      setIsPendingNewCompany(null);
      saveDatabaseConnectionToStorage({ id: details.id, name: details.title, url: details.url });
      const msg = moved
        ? `Kết nối thành công "${details.title}" và đã tự động đưa vào thư mục HR-Salary!`
        : `Kết nối thành công "${details.title}" (nằm trong thư mục HR-Salary).`;
      setSuccessMessage(msg);
      setCustomSheetInput('');
      setTimeout(() => setSuccessMessage(null), 3500);
      handleLoadDriveFiles();
    } catch (err: any) {
      setErrorMessage(`Không tìm thấy bảng tính: ${err.message}`);
    } finally {
      setIsGoogleProcessing(false);
    }
  };

  // Create clean database for new company
  const handleCreateNewCompanyDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      setErrorMessage('Vui lòng nhập tên công ty / doanh nghiệp mới!');
      return;
    }

    setIsGoogleProcessing(true);
    setErrorMessage(null);
    try {
      const res = await createNewCompanySpreadsheet({
        companyName: newCompanyName.trim(),
        taxCode: newCompanyTaxCode.trim(),
        directorName: newCompanyDirector.trim(),
        chiefAccountantName: newCompanyAccountant.trim(),
        address: newCompanyAddress.trim(),
        phoneNumber: newCompanyPhone.trim(),
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1
      });

      setSelectedFileId(res.id);
      setSelectedFileName(res.title);
      setSelectedFileUrl(res.url);
      setHrSalaryFolder(res.folder);
      setIsPendingNewCompany(res.cleanData);
      saveDatabaseConnectionToStorage({ id: res.id, name: res.title, url: res.url });

      // Also apply right away to app if callback provided
      if (onApplyNewCompanyData) {
        onApplyNewCompanyData(res.cleanData, {
          id: res.id,
          url: res.url,
          title: res.title
        });
      }

      setSyncState(prev => ({
        ...prev,
        isConnected: true,
        spreadsheetId: res.id,
        spreadsheetName: res.title,
        spreadsheetUrl: res.url,
        syncMessage: `Đang kết nối cơ sở dữ liệu mới: ${res.title}`
      }));

      const msg = `Đã tạo mới thành công bảng tính "${res.title}" trong thư mục HR-Salary trên Google Drive! Cơ sở dữ liệu được để trống hoàn toàn để bạn nhập liệu khi đăng nhập.`;
      setNewCompanySuccessNotice(msg);
      setSuccessMessage(msg);
      setShowCreateCompanyForm(false);
      setNewCompanyName('');
      setNewCompanyTaxCode('');
      setNewCompanyDirector('');
      setNewCompanyAccountant('');

      // Reload drive list to include the newly created sheet in HR-Salary folder
      handleLoadDriveFiles();

      // Auto switch to login tab
      setTimeout(() => {
        setActiveTab('login');
      }, 1200);
    } catch (err: any) {
      console.error('Lỗi khi tạo mới bảng tính công ty:', err);
      setErrorMessage(`Tạo mới cơ sở dữ liệu thất bại: ${err.message}`);
    } finally {
      setIsGoogleProcessing(false);
    }
  };

  // Apply selected database and proceed to login
  const handleApplyAndSwitchToLogin = async () => {
    if (selectedFileId && !isPendingNewCompany && onLoadDataFromSpreadsheet) {
      setIsGoogleProcessing(true);
      try {
        await onLoadDataFromSpreadsheet(selectedFileId, selectedFileName || undefined);
        setSuccessMessage(`Đã nạp cơ sở dữ liệu từ "${selectedFileName || selectedFileId}".`);
      } catch (err: any) {
        setErrorMessage(`Lỗi nạp dữ liệu từ bảng tính: ${err.message}`);
      } finally {
        setIsGoogleProcessing(false);
      }
    }
    setActiveTab('login');
  };

  // Check if currently targeting demo data (no spreadsheet linked/selected)
  const isTargetingDemo = !isPendingNewCompany && (!selectedFileId && !syncState.spreadsheetId || syncState.isDemoMode || localStorage.getItem('payroll_is_demo_mode') === 'true');

  // Actual login execution
  const executeLogin = async (uname: string, pwd?: string, forceDemo?: boolean) => {
    const isDemo = forceDemo ?? (
      !isPendingNewCompany && (
        (!selectedFileId && !syncState.spreadsheetId) || 
        syncState.isDemoMode || 
        localStorage.getItem('payroll_is_demo_mode') === 'true'
      )
    );

    if (isDemo) {
      localStorage.setItem('payroll_is_demo_mode', 'true');
      setSyncState(prev => ({
        ...prev,
        isDemoMode: true,
        spreadsheetId: null,
        spreadsheetName: null,
        spreadsheetUrl: null,
        syncMessage: 'Đang dùng dữ liệu mẫu nội bộ (Khóa đồng bộ Google Sheets)'
      }));
    } else {
      localStorage.setItem('payroll_is_demo_mode', 'false');
      setSyncState(prev => ({
        ...prev,
        isDemoMode: false
      }));

      // If a Google sheet is selected and user is connected, load latest data and system settings upon login
      if (syncState.isConnected && selectedFileId && !isPendingNewCompany && onLoadDataFromSpreadsheet) {
        try {
          await onLoadDataFromSpreadsheet(selectedFileId, selectedFileName || undefined);
        } catch (err) {
          console.warn('Lỗi nạp Google Sheet trước khi đăng nhập:', err);
        }
      }

      // Lưu lại đường dẫn file cơ sở dữ liệu đã kết nối thành công để phục vụ các lần tiếp theo
      const activeId = selectedFileId || syncState.spreadsheetId;
      const activeName = selectedFileName || syncState.spreadsheetName;
      const activeUrl = selectedFileUrl || syncState.spreadsheetUrl || (activeId ? `https://docs.google.com/spreadsheets/d/${activeId}/edit` : null);
      if (activeId && activeUrl) {
        saveDatabaseConnectionToStorage({ id: activeId, name: activeName, url: activeUrl });
      }
    }

    const result = login(uname, pwd || '123');
    if (!result.success) {
      setErrorMessage(result.error || 'Đăng nhập không thành công!');
      return;
    }

    setSuccessMessage(
      isDemo 
        ? 'Đăng nhập thành công với Dữ liệu mẫu nội bộ (Chế độ Demo - Đã khóa đồng bộ Sheets)!' 
        : `Đăng nhập thành công với tài khoản "${uname}"!`
    );
    setTimeout(() => {
      setSuccessMessage(null);
      if (onClose) onClose();
    }, 600);
  };

  // Lưu đường dẫn file cơ sở dữ liệu hiện tại để phục vụ cho các lần đăng nhập tiếp theo
  const saveCurrentDatabaseConnection = (override?: { id?: string | null; name?: string | null; url?: string | null }) => {
    const id = override?.id !== undefined ? override.id : (selectedFileId || syncState.spreadsheetId);
    const name = override?.name !== undefined ? override.name : (selectedFileName || syncState.spreadsheetName);
    const url = override?.url !== undefined ? override.url : (selectedFileUrl || syncState.spreadsheetUrl || (id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null));

    if (id && url) {
      saveDatabaseConnectionToStorage({ id, name, url });
    }
  };

  // Tự động lưu đường dẫn khi có thay đổi file cơ sở dữ liệu
  useEffect(() => {
    if (selectedFileId) {
      const activeUrl = selectedFileUrl || syncState.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${selectedFileId}/edit`;
      saveDatabaseConnectionToStorage({
        id: selectedFileId,
        name: selectedFileName || syncState.spreadsheetName || 'Bảng tính Google Sheets',
        url: activeUrl
      });
    }
  }, [selectedFileId, selectedFileName, selectedFileUrl]);

  // Khi thoát cửa sổ đăng nhập: luôn đảm bảo lưu đường dẫn file cơ sở dữ liệu trước đó
  useEffect(() => {
    return () => {
      saveCurrentDatabaseConnection();
    };
  }, [selectedFileId, selectedFileName, selectedFileUrl, syncState.spreadsheetId, syncState.spreadsheetUrl, syncState.spreadsheetName]);

  // Thoát khỏi cửa sổ đăng nhập: luôn lưu thông tin file trước đó rồi mới đóng
  const handleExitModal = () => {
    saveCurrentDatabaseConnection();
    if (onClose) onClose();
  };

  // Khôi phục lại đường dẫn file cơ sở dữ liệu đã lưu từ lần trước
  const handleRestoreSavedDatabase = () => {
    const saved = getSavedDatabaseInfo();
    if (saved) {
      setSelectedFileId(saved.id);
      setSelectedFileName(saved.name);
      setSelectedFileUrl(saved.url);
      setIsPendingNewCompany(null);
      saveDatabaseConnectionToStorage(saved);
      setSuccessMessage(`Đã khôi phục đường dẫn cơ sở dữ liệu: "${saved.name}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  // Submit Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // If logging into demo data, validate credentials first and show red warning confirmation
    if (isTargetingDemo) {
      const cleanUsername = username.trim().toLowerCase();
      const foundUser = users.find(u => 
        u.username.toLowerCase() === cleanUsername || 
        u.email.toLowerCase() === cleanUsername
      );

      if (!foundUser) {
        setErrorMessage('Tên đăng nhập hoặc Email không tồn tại trong hệ thống!');
        return;
      }

      if (foundUser.status === 'locked') {
        setErrorMessage('Tài khoản này đã bị tạm khóa. Vui lòng liên hệ Quản trị viên!');
        return;
      }

      if (foundUser.password && password !== undefined && foundUser.password !== password) {
        setErrorMessage('Mật khẩu không chính xác. Vui lòng thử lại!');
        return;
      }

      setPendingCredentials({ username, password });
      setShowDemoWarningModal(true);
      return;
    }

    await executeLogin(username, password);
  };

  // 1-Click Quick Login
  const handleQuickLogin = async (uname: string, pwd?: string) => {
    setUsername(uname);
    setPassword(pwd || '123');
    setErrorMessage(null);

    if (isTargetingDemo) {
      setPendingCredentials({ username: uname, password: pwd || '123' });
      setShowDemoWarningModal(true);
      return;
    }

    await executeLogin(uname, pwd || '123');
  };

  // Switch to local demo data from Google tab
  const handleUseLocalDemoData = () => {
    setPendingCredentials(null);
    setShowDemoWarningModal(true);
  };

  // Dismiss Demo Warning (stay on login screen)
  const handleDismissDemoWarning = () => {
    setShowDemoWarningModal(false);
  };

  // Confirm Demo Login / Switch
  const handleConfirmDemoLogin = async () => {
    setShowDemoWarningModal(false);
    localStorage.setItem('payroll_is_demo_mode', 'true');
    setSyncState(prev => ({
      ...prev,
      isDemoMode: true,
      spreadsheetId: null,
      spreadsheetName: null,
      spreadsheetUrl: null,
      syncMessage: 'Đang dùng dữ liệu mẫu nội bộ (Khóa đồng bộ Google Sheets)'
    }));
    if (onResetToDemoData) {
      onResetToDemoData();
    }
    setSelectedFileId(null);
    setSelectedFileName(null);
    setSelectedFileUrl(null);
    setIsPendingNewCompany(null);
    setNewCompanySuccessNotice(null);

    if (pendingCredentials) {
      await executeLogin(pendingCredentials.username, pendingCredentials.password, true);
      setPendingCredentials(null);
    } else {
      setSuccessMessage('Đã chuyển sang chế độ Dữ liệu mẫu nội bộ (Khóa đồng bộ Google Sheets).');
      setTimeout(() => setSuccessMessage(null), 2500);
      setActiveTab('login');
    }
  };

  // Cancel Demo Login
  const handleCancelDemoLogin = () => {
    setShowDemoWarningModal(false);
    setPendingCredentials(null);
    setActiveTab('google');
    if (syncState.isConnected && driveFiles.length === 0) {
      handleLoadDriveFiles();
    }
  };

  // Filter drive files by search
  const filteredFiles = driveFiles.filter(f => 
    f.name.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 relative overflow-hidden my-auto max-h-[95vh] flex flex-col">
        {/* Top Decorative Line */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600" />

        {/* Close button only when already authenticated - Lưu thông tin trước khi thoát */}
        {isAuthenticated && onClose && (
          <button
            type="button"
            onClick={handleExitModal}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng cửa sổ (Lưu đường dẫn cơ sở dữ liệu)"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Company Header */}
        <div className="text-center mb-4 pt-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md mb-2">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
            Đăng Nhập Phần Mềm Tính Lương
          </h2>
          
          {/* Active Company & Database Badge */}
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <span className="font-bold text-slate-800 uppercase tracking-wide">
              {isPendingNewCompany ? isPendingNewCompany.settings.companyName : settings.companyName}
            </span>
            {selectedFileName || syncState.spreadsheetName ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                <span className="max-w-[160px] truncate">{selectedFileName || syncState.spreadsheetName}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-bold text-red-700">
                <AlertTriangle className="w-3 h-3 text-red-600" />
                <span>Dữ liệu mẫu nội bộ (Khóa đồng bộ Sheets)</span>
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 text-xs font-bold border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Đăng Nhập Tài Khoản</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('google');
              if (syncState.isConnected && driveFiles.length === 0) {
                handleLoadDriveFiles();
              }
            }}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'google'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-blue-600" />
            <span>Cơ Sở Dữ Liệu Google Drive / Sheet</span>
            {(selectedFileName || syncState.spreadsheetId) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="flex-1">{errorMessage}</span>
            <button 
              type="button" 
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="flex-1">{successMessage}</span>
          </div>
        )}

        {newCompanySuccessNotice && (
          <div className="mb-3 p-3 bg-teal-50 border border-teal-200 text-teal-900 rounded-xl text-xs font-medium space-y-1">
            <div className="font-bold flex items-center gap-1 text-teal-800">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Cơ sở dữ liệu công ty mới đã sẵn sàng!</span>
            </div>
            <p className="text-[11px] text-teal-700">
              Bảng tính Google Sheets đã được khởi tạo với cấu trúc 8 phân hệ rỗng (0 nhân viên). Hãy đăng nhập để bắt đầu thiết lập thông tin nhân sự và bảng lương mới.
            </p>
          </div>
        )}

        {/* TAB 1: USER LOGIN */}
        {activeTab === 'login' && (
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Active Data Source Summary Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className={`p-2 rounded-xl shrink-0 ${selectedFileName || syncState.spreadsheetId ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {selectedFileName || syncState.spreadsheetId ? <Cloud className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Nguồn dữ liệu làm việc</div>
                    <div className="font-bold text-slate-800 truncate">
                      {selectedFileName || syncState.spreadsheetName || 'Dữ liệu mẫu nội bộ'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('google');
                    if (syncState.isConnected && driveFiles.length === 0) {
                      handleLoadDriveFiles();
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded-lg transition-colors shrink-0 cursor-pointer shadow-2xs"
                >
                  Đổi / Tạo mới ➔
                </button>
              </div>

              {/* Đường dẫn file cơ sở dữ liệu đã lưu / đang kết nối */}
              {(selectedFileUrl || syncState.spreadsheetUrl) && (
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2 text-[11px]">
                  <div className="truncate flex items-center gap-1.5 text-slate-600">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-[10px] text-slate-400 shrink-0">Đường dẫn:</span>
                    <span className="font-mono text-slate-600 truncate max-w-[260px] sm:max-w-[340px]" title={selectedFileUrl || syncState.spreadsheetUrl || ''}>
                      {selectedFileUrl || syncState.spreadsheetUrl}
                    </span>
                  </div>
                  <a
                    href={selectedFileUrl || syncState.spreadsheetUrl || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 shrink-0 text-[10px] hover:underline"
                    title="Mở Google Spreadsheet trên tab mới"
                  >
                    <span>Mở link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Khối gợi ý khôi phục: Nếu đang ở chế độ Dữ liệu mẫu nhưng trước đó đã có file cơ sở dữ liệu được lưu */}
            {isTargetingDemo && savedDb && (
              <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs animate-in fade-in">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] uppercase font-bold text-blue-700">Đường dẫn cơ sở dữ liệu đã lưu trước đó:</div>
                    <div className="font-bold text-slate-800 text-[11px] truncate">{savedDb.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate max-w-[240px] sm:max-w-[300px]" title={savedDb.url}>
                      {savedDb.url}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRestoreSavedDatabase}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 cursor-pointer"
                  title="Sử dụng lại cơ sở dữ liệu đã kết nối ở phiên trước"
                >
                  Dùng lại file này
                </button>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tên đăng nhập hoặc Email</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="admin, ketoantruong, nhanvien..."
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Mật khẩu truy cập</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Nhập mật khẩu (Mặc định: 123)"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isGoogleProcessing}
                className="w-full mt-1 py-2.5 sm:py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isGoogleProcessing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>Đăng Nhập Hệ Thống</span>
              </button>
            </form>

            {/* Quick Demo One-Click Accounts */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Đăng Nhập Nhanh Mẫu (1-Click)</span>
                </span>
                <span className="text-[10px] text-slate-400">Pass: 123</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin', '123')}
                  className="p-2 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 group-hover:text-emerald-700">👑 Quản Trị Viên</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-slate-500">admin / Toàn quyền</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('ketoantruong', '123')}
                  className="p-2 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 group-hover:text-blue-700">💼 Kế Toán Trưởng</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-slate-500">ketoantruong / Duyệt lương</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('ketoanluong', '123')}
                  className="p-2 bg-slate-50 hover:bg-purple-50 hover:border-purple-300 border border-slate-200 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 group-hover:text-purple-700">📝 Kế Toán Lương</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-slate-500">ketoanluong / Chấm công, BH</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('nhanvien', '123')}
                  className="p-2 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 border border-slate-200 rounded-xl text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 group-hover:text-teal-700">👤 Người Lao Động</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="text-[10px] text-slate-500">nhanvien / Xem phiếu lương</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GOOGLE DRIVE / SHEETS & NEW COMPANY DATABASE */}
        {activeTab === 'google' && (
          <div className="space-y-4 overflow-y-auto pr-1">
            {/* Google Authentication Box */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Trạng thái kết nối Google</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${syncState.isConnected ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-amber-400'}`} />
                  <span className="text-xs font-bold text-slate-900">
                    {syncState.isConnected ? syncState.userEmail : 'Chưa đăng nhập Google'}
                  </span>
                </div>
              </div>

              {syncState.isConnected ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadDriveFiles}
                    disabled={isLoadingFiles}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Tải lại danh sách bảng tính từ Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-emerald-600' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors cursor-pointer"
                  >
                    Đăng xuất
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleProcessing}
                  className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 shadow-xs cursor-pointer transition-all shrink-0"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  <span>Kết Nối Google Drive / Sheets</span>
                </button>
              )}
            </div>

            {/* DEDICATED HR-SALARY FOLDER BANNER */}
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50/70 border border-amber-200/90 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Folder className="w-5 h-5 fill-amber-100" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase font-bold text-amber-800 flex items-center gap-1.5 flex-wrap">
                    <span>Thư mục lưu trữ tập trung:</span>
                    <span className="px-2 py-0.5 bg-amber-200/80 text-amber-950 font-black rounded-md tracking-wider">
                      {GOOGLE_DRIVE_FOLDER_NAME}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900/80 mt-0.5 leading-snug">
                    Tất cả cơ sở dữ liệu phải nằm trong thư mục <strong>HR-Salary</strong>. File bên ngoài sẽ không xuất hiện trong danh sách.
                  </p>
                </div>
              </div>

              {hrSalaryFolder?.webViewLink && (
                <a
                  href={hrSalaryFolder.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"
                  title="Mở thư mục HR-Salary trên Google Drive"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden sm:inline">Mở HR-Salary</span>
                  <ExternalLink className="w-3 h-3 text-amber-600" />
                </a>
              )}
            </div>

            {/* Currently Active / Selected Spreadsheet Display */}
            {selectedFileId && (
              <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-2xl flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] uppercase font-bold text-emerald-700">Bảng tính đang được chọn:</div>
                    <div className="font-bold text-slate-900 truncate">{selectedFileName || selectedFileId}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedFileUrl && (
                    <a
                      href={selectedFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 text-emerald-700 hover:text-emerald-900 bg-white border border-emerald-300 rounded-lg shadow-2xs transition-colors"
                      title="Mở Google Sheets trên tab mới"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyAndSwitchToLogin}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Dùng Bảng Này</span>
                  </button>
                </div>
              </div>
            )}

            {/* ACTION 1: CREATE NEW COMPANY DATABASE */}
            <div className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50/60 to-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-teal-900 font-bold text-xs">
                  <div className="p-1.5 bg-teal-600 text-white rounded-lg">
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <span>Tạo Mới Cơ Sở Dữ Liệu Cho Công Ty Mới</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateCompanyForm(prev => !prev)}
                  className="text-xs font-bold text-teal-700 hover:text-teal-900 bg-white px-2.5 py-1 rounded-lg border border-teal-300 shadow-2xs transition-colors cursor-pointer"
                >
                  {showCreateCompanyForm ? 'Thu gọn' : '+ Mở form tạo mới'}
                </button>
              </div>

              <p className="text-[11px] text-teal-800 leading-relaxed">
                Tạo một Google Spreadsheet hoàn toàn mới trên Drive cho một doanh nghiệp mới. 
                <span className="font-bold"> Dữ liệu nhân sự và chấm công sẽ để trống hoàn toàn</span> để bạn bắt đầu nhập mới khi đăng nhập vào phần mềm.
              </p>

              {showCreateCompanyForm && (
                <form onSubmit={handleCreateNewCompanyDatabase} className="mt-3 pt-3 border-t border-teal-200/80 space-y-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Tên công ty / doanh nghiệp mới <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Công ty Cổ phần Công nghệ Ánh Dương"
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Mã số thuế</label>
                      <input
                        type="text"
                        placeholder="0109988776"
                        value={newCompanyTaxCode}
                        onChange={e => setNewCompanyTaxCode(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Giám đốc đại diện</label>
                      <input
                        type="text"
                        placeholder="Nguyễn Văn A"
                        value={newCompanyDirector}
                        onChange={e => setNewCompanyDirector(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kế toán trưởng</label>
                    <input
                      type="text"
                      placeholder="Trần Thị B"
                      value={newCompanyAccountant}
                      onChange={e => setNewCompanyAccountant(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Địa chỉ trụ sở</label>
                    <input
                      type="text"
                      placeholder="Tầng 5, Tòa nhà ABC, Hà Nội"
                      value={newCompanyAddress}
                      onChange={e => setNewCompanyAddress(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Số điện thoại liên hệ</label>
                    <input
                      type="text"
                      placeholder="024.1234.5678"
                      value={newCompanyPhone}
                      onChange={e => setNewCompanyPhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="p-2.5 bg-white/80 rounded-xl border border-teal-200 text-[11px] text-teal-800 space-y-1">
                    <div className="font-bold flex items-center gap-1 text-teal-900">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                      <span>Quy trình tự động hóa:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                      <li>Khởi tạo Google Sheets: 8 tab chuẩn (Cài đặt, Nhân viên, BHXH, Chấm công...).</li>
                      <li>Dữ liệu ban đầu để trống (0 nhân viên) — sẵn sàng nhập liệu ngay.</li>
                      <li>Tự động liên kết và chuyển về màn hình đăng nhập.</li>
                    </ul>
                  </div>

                  <button
                    type="submit"
                    disabled={isGoogleProcessing || !syncState.isConnected}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isGoogleProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Tạo Mới Cơ Sở Dữ Liệu Rỗng Trên Google Drive</span>
                  </button>
                  {!syncState.isConnected && (
                    <p className="text-[11px] text-amber-700 text-center">
                      * Cần kết nối tài khoản Google trước khi tạo file trên Drive.
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* ACTION 2: SELECT EXISTING SPREADSHEET FROM DRIVE */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
                  <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                    <FolderOpen className="w-4 h-4" />
                  </div>
                  <span>Lựa Chọn Google Sheet Có Sẵn Trên Drive</span>
                </div>
                {syncState.isConnected && (
                  <button
                    type="button"
                    onClick={handleLoadDriveFiles}
                    disabled={isLoadingFiles}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                    <span>Lấy lại danh sách</span>
                  </button>
                )}
              </div>

              {/* Direct Link or ID input */}
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Dán link hoặc mã Spreadsheet ID..."
                      value={customSheetInput}
                      onChange={e => setCustomSheetInput(e.target.value)}
                      className="w-full pl-3 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectCustomSheet}
                    disabled={!customSheetInput.trim() || isGoogleProcessing || !syncState.isConnected}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    Kết nối
                  </button>
                </div>

                {savedDb && (
                  <div className="flex items-center justify-between text-[11px] bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
                    <span className="text-slate-600 truncate flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-slate-400 text-[10px]">Đã lưu trước đó:</span>
                      <strong className="text-slate-700 truncate max-w-[180px] sm:max-w-[240px]">{savedDb.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomSheetInput(savedDb.url)}
                      className="text-blue-600 hover:text-blue-800 font-semibold underline text-[10px] shrink-0 cursor-pointer"
                    >
                      Dán link này
                    </button>
                  </div>
                )}
              </div>

              {/* List of files on drive */}
              {syncState.isConnected ? (
                <div className="space-y-2">
                  {driveFiles.length > 0 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm bảng tính..."
                        value={fileSearchQuery}
                        onChange={e => setFileSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                      />
                    </div>
                  )}

                  {isLoadingFiles ? (
                    <div className="py-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
                      <span>Đang quét danh sách bảng tính trong thư mục HR-Salary trên Google Drive...</span>
                    </div>
                  ) : filteredFiles.length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-700">
                          <Folder className="w-3.5 h-3.5 text-amber-500 fill-amber-100" />
                          <span>Bảng tính trong thư mục <strong>HR-Salary</strong> ({filteredFiles.length}):</span>
                        </span>
                        <span className="text-[10px] text-slate-400 italic">Chỉ hiển thị file trong HR-Salary</span>
                      </div>

                      <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                        {filteredFiles.map(file => {
                          const isSelected = selectedFileId === file.id;
                          const isSavedFile = savedDb && savedDb.id === file.id;
                          return (
                            <div
                              key={file.id}
                              onClick={() => handleSelectSpreadsheet(file)}
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${
                                isSelected
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
                                  : 'bg-slate-50/70 hover:bg-slate-100 border-slate-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <FileSpreadsheet className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-emerald-500'}`} />
                                <span className="truncate">{file.name}</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-100/90 text-amber-800 rounded font-semibold shrink-0">
                                  HR-Salary
                                </span>
                                {isSavedFile && !isSelected && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold shrink-0">
                                    Đã lưu trước đó
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isSelected ? (
                                  <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-bold">
                                    Đang chọn
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="px-2 py-0.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-md text-[10px]"
                                  >
                                    Chọn
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="py-5 px-3 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-1.5">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                        <Folder className="w-4 h-4 fill-amber-200" />
                      </div>
                      <p className="font-bold text-slate-700">Chưa có bảng tính nào trong thư mục &quot;HR-Salary&quot;.</p>
                      <p className="text-[11px] text-slate-500 max-w-md mx-auto leading-relaxed">
                        Toàn bộ dữ liệu nằm ngoài thư mục <strong>HR-Salary</strong> sẽ không xuất hiện trong danh sách để đảm bảo quản lý tập trung. Hãy nhấn nút <strong>&quot;+ Mở form tạo mới&quot;</strong> ở trên để khởi tạo cơ sở dữ liệu công ty mới vào thư mục HR-Salary.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Vui lòng nhấn nút &quot;Kết Nối Google Drive / Sheets&quot; ở trên để xem danh sách bảng tính.
                </div>
              )}
            </div>

            {/* Offline / Local Demo fallback option */}
            <div className="pt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={handleUseLocalDemoData}
                className="text-slate-500 hover:text-slate-700 underline text-[11px] cursor-pointer"
              >
                Hoặc làm việc với dữ liệu mẫu nội bộ (Không dùng Google Sheets)
              </button>

              <button
                type="button"
                onClick={handleApplyAndSwitchToLogin}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Quay lại đăng nhập</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Security Footnote */}
        <div className="mt-3 pt-2 text-center text-[10px] text-slate-400 border-t border-slate-100 flex items-center justify-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Dữ liệu bảng lương được đồng bộ bảo mật trực tiếp trên Google Drive cá nhân của bạn.</span>
        </div>
      </div>

      {/* RED WARNING CONFIRMATION MODAL FOR SAMPLE DATA (DỮ LIỆU MẪU NỘI BỘ) */}
      {showDemoWarningModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border-2 border-red-500 overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col my-auto max-h-[92vh]">
            {/* Top Warning Strip */}
            <div className="h-2.5 bg-gradient-to-r from-red-600 via-rose-600 to-amber-600" />

            {/* Red Header */}
            <div className="bg-gradient-to-r from-red-700 via-rose-800 to-red-900 p-5 sm:p-6 text-white relative">
              <button
                type="button"
                onClick={handleDismissDemoWarning}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Đóng cảnh báo"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-red-600/90 rounded-2xl border border-red-400 shadow-md animate-pulse shrink-0">
                  <AlertTriangle className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className="inline-block px-2 py-0.5 rounded-full bg-red-500/60 text-[10px] font-black uppercase tracking-wider text-rose-100 mb-1 border border-red-400/40">
                    Cảnh báo an toàn dữ liệu Google Sheets
                  </div>
                  <h3 className="text-base sm:text-xl font-black tracking-tight text-white leading-tight">
                    CẢNH BÁO: ĐĂNG NHẬP DỮ LIỆU MẪU NỘI BỘ
                  </h3>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              {/* Red Alert Box */}
              <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-xs space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-extrabold text-sm text-red-900">
                      Bạn đang chọn đăng nhập vào chế độ &quot;Dữ liệu mẫu nội bộ&quot;!
                    </div>
                    <p className="text-red-800 leading-relaxed text-xs">
                      {pendingCredentials ? (
                        <>
                          Bạn đang chuẩn bị đăng nhập với tài khoản <strong className="font-mono bg-red-200/90 px-1.5 py-0.5 rounded text-red-950 font-bold">{pendingCredentials.username}</strong> vào cơ sở dữ liệu mẫu nội bộ (chưa liên kết với bảng tính Google Sheets của doanh nghiệp).
                        </>
                      ) : (
                        <>
                          Bạn đang chọn làm việc với cơ sở dữ liệu mẫu nội bộ độc lập (không liên kết với Google Sheets).
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Crucial Data Protection Rule */}
                <div className="p-3.5 bg-white rounded-xl border border-red-200 space-y-2 text-slate-800 shadow-xs">
                  <div className="font-bold text-red-700 flex items-center gap-1.5 text-xs">
                    <Lock className="w-4 h-4 text-red-600 shrink-0" />
                    <span>HỆ THỐNG SẼ KHÓA TOÀN BỘ ĐỒNG BỘ LÊN GOOGLE SHEETS:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
                    <li>
                      <strong>Tuyệt đối không cho phép đồng bộ dữ liệu lên Google Sheets</strong> trong suốt quá trình bạn sử dụng Dữ liệu mẫu nội bộ.
                    </li>
                    <li>
                      Mục đích: <strong className="text-red-700">Tránh việc ghi sai hoặc ghi đè dữ liệu mẫu vào cơ sở dữ liệu đã kết nối trong Google Sheets</strong> của doanh nghiệp bạn.
                    </li>
                    <li>
                      Mọi dữ liệu bảng lương, nhân sự, chấm công trong phiên này chỉ mang tính chất minh họa / dùng thử nghiệm nội bộ.
                    </li>
                  </ul>
                </div>
              </div>

              {/* Confirmation Question */}
              <div className="text-center font-bold text-slate-900 text-sm sm:text-base pt-1">
                Bạn có chắc chắn muốn thực hiện đăng nhập vào Dữ liệu mẫu nội bộ hay không?
              </div>

              {/* Actions */}
              <div className="space-y-2.5 pt-1">
                {/* Button 1: Proceed with demo login (Red Warning Action) */}
                <button
                  type="button"
                  onClick={handleConfirmDemoLogin}
                  className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Có, Xác nhận thực hiện (Khóa đồng bộ Sheets)</span>
                </button>

                {/* Button 2: Cancel & Switch to Google Sheets */}
                <button
                  type="button"
                  onClick={handleCancelDemoLogin}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm rounded-2xl border border-slate-300 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Cloud className="w-4 h-4 text-blue-600" />
                  <span>Hủy bỏ &amp; Chọn kết nối Google Sheets của công ty</span>
                </button>

                {/* Button 3: Dismiss dialog */}
                <button
                  type="button"
                  onClick={handleDismissDemoWarning}
                  className="w-full py-1.5 text-center text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                >
                  Đóng cảnh báo và quay lại form đăng nhập
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
