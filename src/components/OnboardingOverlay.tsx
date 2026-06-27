import { useState } from "react";
import {
  ArrowRight,
  Check,
  Cloud,
  FolderOpen,
  Music2,
  Radio,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { NetEaseServiceStatus } from "../features/musicSources/provider";

const ONBOARDING_STORAGE_KEY = "ome.onboarding.completed";

export function isOnboardingCompleted(): boolean {
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
}

export function markOnboardingCompleted(): void {
  window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
}

export function resetOnboarding(): void {
  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}

interface OnboardingOverlayProps {
  serviceStatus: NetEaseServiceStatus | null;
  localTrackCount: number;
  neteaseLoggedIn: boolean;
  bilibiliLoggedIn: boolean;
  onClose: () => void;
  onImportMusic: () => void;
  onOpenNeteaseSettings: () => void;
  onOpenBilibiliSettings: () => void;
}

interface OnboardingStep {
  id: string;
  icon: typeof Music2;
  title: string;
  subtitle: string;
  body: string;
  cta?: { label: string; onClick: () => void };
  done?: boolean;
  doneLabel?: string;
}

export function OnboardingOverlay({
  serviceStatus,
  localTrackCount,
  neteaseLoggedIn,
  bilibiliLoggedIn,
  onClose,
  onImportMusic,
  onOpenNeteaseSettings,
  onOpenBilibiliSettings,
}: OnboardingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const handleFinish = () => {
    markOnboardingCompleted();
    onClose();
  };

  const handleSkip = () => {
    markOnboardingCompleted();
    onClose();
  };

  const musicImported = localTrackCount > 0;
  const neteaseReady = Boolean(serviceStatus?.running || serviceStatus?.nodeAvailable === false);

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      icon: Sparkles,
      title: "欢迎使用 Ome Music",
      subtitle: "Welcome to Ome Music",
      body: "小而美的沉浸式桌面音乐播放器。支持本地音乐、网易云音乐、Bilibili 音频与氛围弹幕。让我们用几步完成初始设置，你也可以随时跳过。",
    },
    {
      id: "local",
      icon: FolderOpen,
      title: "导入本地音乐",
      subtitle: "Import Local Music",
      body: "点击顶部搜索框，输入本地音乐文件夹路径（如 D:\\Music），按回车即可自动扫描导入。支持 mp3、flac、wav、m4a 等格式。",
      cta: musicImported ? undefined : { label: "去导入", onClick: onImportMusic },
      done: musicImported,
      doneLabel: `已导入 ${localTrackCount} 首`,
    },
    {
      id: "netease",
      icon: Cloud,
      title: "连接网易云音乐",
      subtitle: "Connect NetEase Cloud Music",
      body:
        neteaseReady && !serviceStatus?.nodeAvailable
          ? "检测到系统未安装 Node.js。网易云音乐功能（搜索、播放、封面、歌词）需要 Node.js v20+ 运行环境。请在设置中安装 Node.js，或使用外部 API 地址。本地音乐不受影响。"
          : "网易云音乐功能需要 Node.js v20+ 和本地 API 服务。安装 Node.js 后软件会自动启动 API 服务。然后在设置中扫码登录即可播放会员歌曲。",
      cta: { label: "去设置", onClick: onOpenNeteaseSettings },
      done: neteaseLoggedIn,
      doneLabel: "已登录",
    },
    {
      id: "bilibili",
      icon: Radio,
      title: "连接 Bilibili",
      subtitle: "Connect Bilibili",
      body: "Bilibili 音源无需额外运行环境。在设置中扫码登录后即可搜索和播放 Bilibili 音频，并解锁视频氛围层与弹幕效果。",
      cta: { label: "去设置", onClick: onOpenBilibiliSettings },
      done: bilibiliLoggedIn,
      doneLabel: "已登录",
    },
    {
      id: "ready",
      icon: Check,
      title: "一切就绪",
      subtitle: "All Set",
      body: "现在你可以开始享受音乐了。在顶部搜索框搜索歌曲，点击右上角齿轮调整歌词与弹幕，底部控制栏管理播放。祝聆听愉快！",
    },
  ];

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const StepIcon = currentStep.icon;
  const progress = ((stepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
    } else {
      setStepIndex((index) => Math.min(index + 1, steps.length - 1));
    }
  };

  const handlePrev = () => {
    setStepIndex((index) => Math.max(index - 1, 0));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#4a2108]/[0.18] backdrop-blur-sm">
      <div
        data-danmaku-safe-zone="onboarding"
        className="relative w-[min(560px,calc(100vw-3rem))] rounded-[32px] border border-white/40 bg-[#f5ece1]/95 p-8 text-[#4a2108] shadow-[0_32px_96px_rgba(74,33,8,0.28)]"
      >
        {/* 关闭/跳过按钮 */}
        <button
          type="button"
          onClick={handleSkip}
          className="app-transition absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-[#4a2108]/[0.05] px-3 py-1.5 text-[11px] font-bold text-[#4a2108]/48 hover:bg-[#4a2108]/[0.1] hover:text-[#4a2108]/72"
        >
          <SkipForward className="h-3.5 w-3.5" />
          跳过引导
        </button>

        {/* 进度条 */}
        <div className="mb-6 mt-2 h-1 w-full overflow-hidden rounded-full bg-[#4a2108]/[0.06]">
          <div
            className="app-transition h-full rounded-full bg-gradient-to-r from-[#c66043]/70 to-[#d4a05a]/80"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 步骤指示器 */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setStepIndex(index)}
              className={`h-1.5 rounded-full app-transition ${
                index === stepIndex
                  ? "w-8 bg-[#c66043]/70"
                  : index < stepIndex
                    ? "w-1.5 bg-[#638052]/55"
                    : "w-1.5 bg-[#4a2108]/12"
              }`}
              aria-label={`Step ${index + 1}: ${step.title}`}
            />
          ))}
        </div>

        {/* 图标 */}
        <div className="mb-5 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#c66043]/12 to-[#d4a05a]/10 shadow-[0_8px_24px_rgba(198,96,67,0.12)]">
            <StepIcon className="h-9 w-9 text-[#7a2d1c]/65" strokeWidth={1.6} />
          </div>
        </div>

        {/* 标题 */}
        <div className="mb-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#4a2108]/32">
            {currentStep.subtitle}
          </p>
          <h2 className="mt-1.5 text-[22px] font-bold text-[#4a2108]/88">{currentStep.title}</h2>
        </div>

        {/* 正文 */}
        <p className="mx-auto mb-6 max-w-[420px] text-center text-[13.5px] font-medium leading-[1.7] text-[#4a2108]/64">
          {currentStep.body}
        </p>

        {/* 完成状态徽章 */}
        {currentStep.done && currentStep.doneLabel && (
          <div className="mb-5 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-[#638052]/12 px-3 py-1 text-[11px] font-bold text-[#3d5230]/72">
              <Check className="h-3.5 w-3.5" />
              {currentStep.doneLabel}
            </span>
          </div>
        )}

        {/* CTA 按钮 */}
        {currentStep.cta && (
          <div className="mb-5 flex justify-center">
            <button
              type="button"
              onClick={currentStep.cta.onClick}
              className="app-transition flex items-center gap-2 rounded-full bg-[#4a2108]/[0.08] px-5 py-2.5 text-xs font-black text-[#4a2108]/72 hover:bg-[#4a2108]/[0.14] hover:text-[#4a2108]/92"
            >
              {currentStep.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* 底部导航 */}
        <div className="flex items-center justify-between border-t border-[#4a2108]/[0.06] pt-5">
          <button
            type="button"
            onClick={handlePrev}
            disabled={stepIndex === 0}
            className="app-transition rounded-full px-4 py-2 text-xs font-bold text-[#4a2108]/38 hover:text-[#4a2108]/62 disabled:opacity-30"
          >
            上一步
          </button>

          <span className="text-[10px] font-semibold text-[#4a2108]/28">
            {stepIndex + 1} / {steps.length}
          </span>

          <button
            type="button"
            onClick={handleNext}
            className="app-transition flex items-center gap-1.5 rounded-full bg-[#c66043]/[0.14] px-5 py-2 text-xs font-black text-[#7a2d1c]/82 hover:bg-[#c66043]/[0.22] hover:text-[#7a2d1c]"
          >
            {isLastStep ? "开始使用" : "下一步"}
            {!isLastStep && <ArrowRight className="h-3.5 w-3.5" />}
            {isLastStep && <Music2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
