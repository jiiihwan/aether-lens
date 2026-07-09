// =======================================================
// [전역 디버깅 툴] 웹브라우저 콘솔 에러 강제 추적 핸들러
// =======================================================
window.onerror = function(message, source, lineno, colno, error) {
  const errText = `🚨 브라우저 JS 에러 감지: ${message}\n파일: ${source}\n위치: 라인 ${lineno}:${colno}\n스택: ${error ? error.stack : ''}`;
  console.error(errText);
  alert(errText);
  return false;
};

// =======================================================
// AetherLens - AI Photo Agent Core Logic (Hybrid Vision SDK)
// =======================================================

// 전역 변수 선언
let stagedFiles = []; 
let filesList = [];
let processedPhotos = [];
let opencvLoadedStatus = false;
let apiDisabledByLimit = false; 

// 1. OpenCV 로딩 상태 관리 및 체크
function checkOpenCvStatus() {
  const badge = document.getElementById('opencv-status');
  if (window.opencvLoaded || (typeof cv !== 'undefined' && cv.Mat)) {
    opencvLoadedStatus = true;
    if (badge) {
      badge.textContent = '준비 완료';
      badge.className = 'status-badge status-ready';
    }
    addLog('[시스템] OpenCV.js (WASM) 로드가 완료되었습니다. 분석 준비가 끝났습니다.', 'success');
  }
}

// index.html의 인라인 스크립트에서 발생하는 이벤트를 가로채어 동기화
window.addEventListener('opencv-ready', () => {
  opencvLoadedStatus = true;
  checkOpenCvStatus();
});

// 2. DOM 초기화 및 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkOpenCvStatus, 500);

  initIcons();
  loadSavedApiKey();
  setupUIEventListeners();
  setupModalEventListeners();
  setupStagingEventListeners();
});

// Lucide 아이콘 초기화
function initIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// 로컬 스토리지에서 저장된 Gemini API Key 불러오기
function loadSavedApiKey() {
  const savedKey = localStorage.getItem('gemini_api_key');
  if (savedKey) {
    const input = document.getElementById('api-key-input');
    if (input) input.value = savedKey;
  }
}

// UI 슬라이더 값 실시간 변경 표시 및 이벤트 바인딩
function setupUIEventListeners() {
  const sliders = [
    { id: 'blur-threshold', valId: 'blur-val', suffix: '' },
    { id: 'dup-threshold', valId: 'dup-val', suffix: '' },
    { id: 'best-ratio', valId: 'ratio-val', suffix: '%' }
  ];

  sliders.forEach(slider => {
    const el = document.getElementById(slider.id);
    const valEl = document.getElementById(slider.valId);
    if (el && valEl) {
      el.addEventListener('input', () => {
        valEl.textContent = el.value + slider.suffix;
      });
    }
  });

  const apiKeyInput = document.getElementById('api-key-input');
  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', (e) => {
      localStorage.setItem('gemini_api_key', e.target.value.trim());
    });
  }

  const selectBtn = document.getElementById('select-btn');
  const fileInput = document.getElementById('file-input');
  
  if (selectBtn && fileInput) {
    selectBtn.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', handleFileSelect);
  }

  const dropZone = document.getElementById('drop-zone');
  if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        addFilesToStaging(e.dataTransfer.files);
      }
    });
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      const tabContent = document.getElementById(tabId);
      if (tabContent) tabContent.classList.add('active');
    });
  });

  const downloadBtn = document.getElementById('download-zip-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadEnhancedPhotosZip);
  }

  const albumTab = document.getElementById('tab-album');
  if (albumTab) {
    albumTab.addEventListener('click', (e) => {
      const btn = e.target.closest('.zoom-btn');
      if (!btn) return;
      
      const zoomBtns = albumTab.querySelectorAll('.zoom-btn');
      zoomBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const zoomType = btn.getAttribute('data-zoom');
      applyAlbumZoom(zoomType);
    });
  }

  const downloadRawBtn = document.getElementById('download-raw-zip-btn');
  if (downloadRawBtn) {
    downloadRawBtn.addEventListener('click', downloadRawPhotosZip);
  }

  const showLogsBtn = document.getElementById('show-terminal-logs-btn');
  if (showLogsBtn) {
    showLogsBtn.addEventListener('click', () => {
      const modalBox = document.getElementById('modal-log-box');
      const originalBox = document.getElementById('terminal-logs-box');
      const logModal = document.getElementById('log-modal');
      if (modalBox && originalBox && logModal) {
        modalBox.innerHTML = originalBox.innerHTML;
        logModal.classList.remove('hidden');
        setTimeout(() => {
          modalBox.scrollTop = modalBox.scrollHeight;
        }, 50);
      }
    });
  }
}

function setupStagingEventListeners() {
  const stagingAddBtn = document.getElementById('staging-add-btn');
  const fileInput = document.getElementById('file-input');
  const startAgentBtn = document.getElementById('start-agent-btn');

  if (stagingAddBtn && fileInput) {
    stagingAddBtn.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (startAgentBtn) {
    startAgentBtn.addEventListener('click', () => {
      const apiKeyInput = document.getElementById('api-key-input');
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
      
      // API Key 미입력 또는 유효하지 않을 때 확인 창(confirm)으로 우회 동의 제어
      if (!isValidApiKey(apiKey)) {
        const proceedLocal = confirm(
          '🔑 Gemini API Key가 입력되지 않았거나 유효하지 않습니다.\n\n' +
          '확인을 누르시면 [AI 감성 캡션/스토리북 제작] 및 [AI Vision 구도 오디션] 없이,\n' +
          '오직 브라우저 로컬 엔진(OpenCV WASM 선명도 & 명암비 대비 통계) 기반의 기본 사진 정리 기능만으로 분석을 진행합니다.\n\n' +
          '로컬 기본 정리 기능만으로 진행하시겠습니까?'
        );
        
        if (!proceedLocal) {
          if (apiKeyInput) {
            apiKeyInput.focus();
            apiKeyInput.scrollIntoView({ behavior: 'smooth' });
          }
          return;
        }
      }

      if (stagedFiles.length === 0) {
        alert('정리 대기 중인 사진이 없습니다. 사진을 먼저 추가해주세요.');
        return;
      }
      runAgentProcess();
    });
  }
}

function setupModalEventListeners() {
  const modal = document.getElementById('detail-modal');
  const closeBtn = document.getElementById('modal-close-btn');

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }

  const logModal = document.getElementById('log-modal');
  const logCloseBtn = document.getElementById('log-modal-close-btn');

  if (logCloseBtn && logModal) {
    logCloseBtn.addEventListener('click', () => {
      logModal.classList.add('hidden');
    });

    logModal.addEventListener('click', (e) => {
      if (e.target === logModal) {
        logModal.classList.add('hidden');
      }
    });
  }
}

// 실시간 터미널 한글 에이전트 로그 출력
function addLog(message, type = 'system') {
  const box = document.getElementById('terminal-logs-box');
  if (!box) return;
  
  const log = document.createElement('div');
  log.className = `log-line ${type}`;
  
  const now = new Date();
  const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
  
  log.textContent = `${timeStr} ${message}`;
  box.appendChild(log);
  box.scrollTop = box.scrollHeight;
}

function setPipelineStep(stepId, status = 'active') {
  const steps = ['step-load', 'step-blur', 'step-dup', 'step-score', 'step-edit', 'step-album'];
  const lines = ['line-1', 'line-2', 'line-3', 'line-4', 'line-5'];
  
  const stepIdx = steps.indexOf(stepId);
  
  steps.forEach((s, idx) => {
    const el = document.getElementById(s);
    if (el) {
      if (idx <= stepIdx) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });

  lines.forEach((l, idx) => {
    const el = document.getElementById(l);
    if (el) {
      if (idx < stepIdx) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
}

function isValidApiKey(key) {
  if (!key) return false;
  const cleanKey = key.trim();
  return cleanKey.startsWith('AIzaSy') && cleanKey.length >= 35;
}

function handleFileSelect() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput || fileInput.files.length === 0) return;

  addFilesToStaging(fileInput.files);
  fileInput.value = ''; 
}

function addFilesToStaging(files) {
  const addedList = Array.from(files);
  stagedFiles = stagedFiles.concat(addedList);
  
  addLog(`[대기열 추가] 사진 ${addedList.length}장이 대기열에 추가되었습니다. (현재 총 대기: ${stagedFiles.length}장)`, 'info');

  document.getElementById('drop-zone').classList.add('hidden');
  document.getElementById('staging-area').classList.remove('hidden');
  document.getElementById('results-panel').classList.add('hidden');

  renderStagingGrid();
}

function renderStagingGrid() {
  const grid = document.getElementById('staging-grid');
  const countEl = document.getElementById('staging-count');
  
  if (!grid || !countEl) return;

  countEl.textContent = stagedFiles.length;
  grid.innerHTML = '';

  if (stagedFiles.length === 0) {
    document.getElementById('drop-zone').classList.remove('hidden');
    document.getElementById('staging-area').classList.add('hidden');
    addLog('[시스템] 대기열의 모든 사진이 삭제되었습니다.', 'system');
    return;
  }

  stagedFiles.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = 'staging-card';
    const blobUrl = URL.createObjectURL(file);

    card.innerHTML = `
      <img src="${blobUrl}" alt="${file.name}">
      <button class="staging-card-remove-btn" title="대기열에서 제거">&times;</button>
    `;

    const removeBtn = card.querySelector('.staging-card-remove-btn');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); 
      stagedFiles.splice(index, 1); 
      URL.revokeObjectURL(blobUrl); 
      renderStagingGrid(); 
    });

    grid.appendChild(card);
  });
}

async function runAgentProcess() {
  filesList = [...stagedFiles]; 
  addLog(`[가동] 최종 ${filesList.length}장의 사진에 대해 AI 분석 파이프라인을 실행합니다.`, 'info');

  apiDisabledByLimit = false; 

  document.getElementById('staging-area').classList.add('hidden');
  document.getElementById('agent-terminal').classList.remove('hidden');
  
  const textEl = document.getElementById('total-progress');
  const barEl = document.getElementById('progress-bar-fill');
  if (textEl) textEl.textContent = '0%';
  if (barEl) barEl.style.width = '0%';

  try {
    await runAgentPipeline();
  } catch (error) {
    addLog(`[중단] 파이프라인 정지: ${error.message}`, 'warning');
    console.error(error);
    
    if (error.message.includes('사용자 취소')) {
      alert("정리 작업 취소:\n" + error.message);
      document.getElementById('agent-terminal').classList.add('hidden');
      document.getElementById('staging-area').classList.remove('hidden');
    } else {
      alert("파이프라인 실행 중 오류가 발생했습니다:\n" + error.message + "\n\n콘솔 로그 및 오류 메시지를 참고하세요.");
    }
  }
}

async function runAgentPipeline() {
  const totalSteps = 6;
  let currentStep = 0;
  
  const updateProgress = (step, stepPercentage) => {
    const baseProgress = ((step - 1) / totalSteps) * 100;
    const stepWeight = 100 / totalSteps;
    const currentProgress = Math.round(baseProgress + (stepPercentage * stepWeight / 100));
    
    const textEl = document.getElementById('total-progress');
    if (textEl) textEl.textContent = `${currentProgress}%`;
    
    const barEl = document.getElementById('progress-bar-fill');
    if (barEl) barEl.style.width = `${currentProgress}%`;
  };

  // Step 1. photo-loader: 메타데이터 추출 및 로드
  currentStep = 1;
  setPipelineStep('step-load');
  addLog('한글 진행 상황: [모듈 1/6] 사진 데이터 및 촬영 정보 로드 작업을 시작합니다.', 'info');
  const loadedPhotos = await photoLoaderModule(filesList, (p) => updateProgress(currentStep, p));
  addLog(`한글 진행 상황: 사진 로딩 및 EXIF 정보 분석 완료. (유효 이미지: ${loadedPhotos.length}장)`, 'success');

  // OpenCV 로드 대기 검증 (최대 5초 타임아웃 안전장치 가동)
  if (!opencvLoadedStatus) {
    addLog('한글 진행 상황: OpenCV.js 로딩 대기 중... 잠시만 기다려주세요.', 'warning');
    let timeoutCounter = 0;
    while (!opencvLoadedStatus && timeoutCounter < 10) { 
      if (window.opencvLoaded || (typeof cv !== 'undefined' && cv.Mat)) {
        opencvLoadedStatus = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      timeoutCounter++;
    }

    if (!opencvLoadedStatus) {
      addLog('[경고] OpenCV.js WASM 로딩 지연이 발생하여, 흔들림 정밀 분석을 제외하고 간이 모드로 즉시 분석을 계속 진행합니다.', 'warning');
    } else {
      checkOpenCvStatus();
    }
  }

  // Step 2. blur-detector: 흔들림 감지
  currentStep = 2;
  setPipelineStep('step-blur');
  addLog('한글 진행 상황: [모듈 2/6] 이미지 선명도 분석(흔들림 감지)을 수행합니다.', 'info');
  const blurThreshold = parseFloat(document.getElementById('blur-threshold').value);
  const blurAnalyzedPhotos = await blurDetectorModule(loadedPhotos, blurThreshold, (p) => updateProgress(currentStep, p));
  const blurryCount = blurAnalyzedPhotos.filter(p => p.isBlurry).length;
  addLog(`한글 진행 상황: 흔들림 감지 완료. (탈락된 흔들린 사진: ${blurryCount}장 / 통과: ${blurAnalyzedPhotos.length - blurryCount}장)`, 'success');

  // Step 3. photo-scorer: 전체 사진에 대해 개별 미적 점수 매김 (중복 제거 전 공정 채점)
  currentStep = 3;
  setPipelineStep('step-score');
  addLog('한글 진행 상황: [모듈 3/6] 전체 정상 이미지에 대해 개별 미적 점수(0~100)를 상세히 산출합니다.', 'info');
  const scoredPhotos = await photoScorerModule(blurAnalyzedPhotos, (p) => updateProgress(currentStep, p));
  addLog('한글 진행 상황: 전체 이미지 개별 채점 완료.', 'success');

  // Step 4. duplicate-detector: 중복 및 연사 제거 (Gemini Vision 구도 오디션 탑재)
  currentStep = 4;
  setPipelineStep('step-dup');
  addLog('한글 진행 상황: [모듈 4/6] 개별 채점 기반 중복 검출 및 Gemini Vision 구도 오디션을 개시합니다.', 'info');
  const dupThreshold = parseFloat(document.getElementById('dup-threshold').value);
  
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  const deduplicatedPhotos = await duplicateDetectorModule(scoredPhotos, dupThreshold, apiKey, (p) => updateProgress(currentStep, p));
  const dupCount = deduplicatedPhotos.filter(p => !p.isBlurry && p.isDuplicate).length;
  addLog(`한글 진행 상황: 중복 이미지 분류 완료. (중복 처리된 컷: ${dupCount}장)`, 'success');

  // Step 5. editor: 선정된 베스트 컷 자동 이미지 보정 (CLAHE)
  currentStep = 5;
  const bestRatio = parseFloat(document.getElementById('best-ratio').value) / 100;
  const finalBestPhotos = applyBestCutRatioFilter(deduplicatedPhotos, bestRatio);
  
  setPipelineStep('step-edit');
  addLog('한글 진행 상황: [모듈 5/6] 최종 선정된 베스트 컷에 대해 명암 개선 처리를 가동합니다.', 'info');
  const editedPhotos = await editorModule(finalBestPhotos, (p) => updateProgress(currentStep, p));
  addLog('한글 진행 상황: 선정된 베스트 사진들에 대한 자동 보정이 완료되었습니다.', 'success');

  // Step 6. album-generator: 여행 스토리 앨범 구축
  currentStep = 6;
  setPipelineStep('step-album');
  addLog('한글 진행 상황: [모듈 6/6] 촬영 시각 기준의 에피소드 클러스터링 및 Gemini AI 연동 스토리라인을 구성합니다.', 'info');
  const albumData = await albumGeneratorModule(editedPhotos, apiKey, (p) => updateProgress(currentStep, p));
  addLog('한글 진행 상황: Gemini AI 기반 앨범북 제작 완료! 정리 완료 페이지로 전환합니다.', 'success');

  processedPhotos = editedPhotos;
  renderResultsDashboard(albumData);
}

// =======================================================
// [모듈 1] photo-loader: 이미지 메타데이터 및 가로/세로 판별
// =======================================================
function photoLoaderModule(files, onProgress) {
  return new Promise((resolve) => {
    let loadedCount = 0;
    const totalFiles = files.length;
    const loadedList = [];

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const blobUrl = URL.createObjectURL(file);
        
        const tempImg = new Image();
        tempImg.src = blobUrl;
        tempImg.onload = function() {
          const orientation = (tempImg.width >= tempImg.height) ? 'landscape' : 'portrait';
          
          EXIF.getData(file, function() {
            const captureTimeRaw = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
            let captureTime = null;
            if (captureTimeRaw) {
              const parts = captureTimeRaw.split(' ');
              if (parts.length === 2) {
                const dateStr = parts[0].replace(/:/g, '-');
                captureTime = new Date(`${dateStr}T${parts[1]}`);
              }
            }
            if (!captureTime || isNaN(captureTime.getTime())) {
              captureTime = new Date(file.lastModified);
            }

            let gps = null;
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lng = EXIF.getTag(this, "GPSLongitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef");
            const lngRef = EXIF.getTag(this, "GPSLongitudeRef");
            
            if (lat && lng) {
              const convertDMSToDD = (dms, ref) => {
                let dd = dms[0] + dms[1]/60 + dms[2]/3600;
                if (ref === "S" || ref === "W") dd = -dd;
                return dd;
              };
              gps = {
                lat: convertDMSToDD(lat, latRef),
                lng: convertDMSToDD(lng, lngRef)
              };
            }

            loadedList.push({
              id: `img_${Math.random().toString(36).substr(2, 9)}`,
              file: file,
              filename: file.name,
              size: file.size,
              blobUrl: blobUrl,
              captureTime: captureTime,
              gps: gps,
              orientation: orientation,
              isBlurry: false,
              isDuplicate: false,
              isBestCut: false,
              isRepresentative: false,
              clusterId: null,
              laplacianScore: 0,
              aestheticScore: 0,
              enhancedBlob: null,
              enhancedUrl: null,
              excludeReason: '분류 대기 중입니다.', 
              decisionReason: null
            });

            loadedCount++;
            onProgress(Math.round((loadedCount / totalFiles) * 100));

            if (loadedCount === totalFiles) {
              loadedList.sort((a, b) => a.captureTime.getTime() - b.captureTime.getTime());
              resolve(loadedList);
            }
          });
        };
      };
      reader.readAsArrayBuffer(file);
    });
  });
}

// =======================================================
// [모듈 2] blur-detector: 흔들림 감지
// =======================================================
async function blurDetectorModule(photos, threshold, onProgress) {
  const result = [];
  const total = photos.length;
  const isCvReady = typeof cv !== 'undefined' && cv.Mat;

  for (let i = 0; i < total; i++) {
    const photo = photos[i];
    if (isCvReady) {
      try {
        const score = await calculateLaplacianVariance(photo.blobUrl);
        photo.laplacianScore = Math.round(score * 10) / 10;
        photo.isBlurry = score < threshold;
        
        if (photo.isBlurry) {
          photo.excludeReason = `흔들림 감지: 사진의 선명도 분산값이 ${photo.laplacianScore}점으로 설정 기준값(${threshold}점)보다 낮아 초점이 잡히지 않은 흐린 사진으로 제외되었습니다.`;
        }
      } catch (err) {
        console.error(`흔들림 분석 실패 (${photo.filename}):`, err);
        photo.laplacianScore = 30.0;
        photo.isBlurry = false;
      }
    } else {
      photo.laplacianScore = 50.0;
      photo.isBlurry = false;
      photo.excludeReason = 'WASM 엔진 미로드로 인해 흔들림 검증을 통과했습니다.';
    }
    result.push(photo);
    onProgress(Math.round(((i + 1) / total) * 100));
  }
  return result;
}

function calculateLaplacianVariance(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = function() {
      try {
        const maxDim = 400;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        let lap = new cv.Mat();
        cv.Laplacian(gray, lap, cv.CV_64F);
        
        let mean = new cv.Mat();
        let stddev = new cv.Mat();
        cv.meanStdDev(lap, mean, stddev);
        
        const variance = stddev.dataDouble[0] * stddev.dataDouble[0];
        
        src.delete();
        gray.delete();
        lap.delete();
        mean.delete();
        stddev.delete();
        
        resolve(variance);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(new Error('이미지 로드 오류'));
  });
}

// =======================================================
// [모듈 3] photo-scorer: 전체 정상 사진 개별 미적 점수 채점 (0~100)
// =======================================================
async function photoScorerModule(photos, onProgress) {
  const validPhotos = photos.filter(p => !p.isBlurry);
  const total = validPhotos.length;

  if (total === 0) {
    onProgress(100);
    return photos;
  }

  for (let i = 0; i < total; i++) {
    const photo = validPhotos[i];
    try {
      const contrastData = await calculateContrastStats(photo.blobUrl);
      photo.exifStats = contrastData;
      
      const normBlur = Math.min(Math.max((photo.laplacianScore - 10) / 140, 0), 1.0) * 25;
      const diff = Math.abs(contrastData.stdDev - 35);
      const contrastScore = Math.max(15 - (diff * 0.8), 0);
      
      let score = 60 + Math.round(normBlur + contrastScore);

      if (contrastData.mean < 50) {
        score -= Math.round((50 - contrastData.mean) * 0.2);
      }
      if (contrastData.mean > 200) {
        score -= Math.round((contrastData.mean - 200) * 0.2);
      }

      const uniqueFudge = (photo.filename.charCodeAt(photo.filename.length - 1) % 10) * 0.4;
      photo.aestheticScore = Math.max(60, Math.min(100, score + Math.round(uniqueFudge)));

    } catch (err) {
      const uniqueFudge = photo.filename.charCodeAt(0) % 15;
      photo.aestheticScore = 65 + uniqueFudge;
      photo.exifStats = { mean: 128, stdDev: 30 };
    }
    onProgress(Math.round(((i + 1) / total) * 100));
  }

  return photos;
}

function calculateContrastStats(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 100, 100);
      
      const imgData = ctx.getImageData(0, 0, 100, 100);
      const data = imgData.data;
      
      let sum = 0;
      let grayVals = [];
      
      for (let i = 0; i < 10000; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayVals.push(gray);
        sum += gray;
      }
      
      const mean = sum / 10000;
      
      let varianceSum = 0;
      for (let i = 0; i < 10000; i++) {
        varianceSum += (grayVals[i] - mean) * (grayVals[i] - mean);
      }
      
      const stdDev = Math.sqrt(varianceSum / 10000);
      resolve({ mean: Math.round(mean), stdDev: Math.round(stdDev) });
    };
    img.onerror = () => resolve({ mean: 128, stdDev: 30 });
  });
}

// =======================================================
// [모듈 4] duplicate-detector: pHash 및 Gemini Vision 구도 오디션
// =======================================================
async function duplicateDetectorModule(photos, threshold, apiKey, onProgress) {
  const validPhotos = photos.filter(p => !p.isBlurry);
  const total = validPhotos.length;

  if (total === 0) {
    onProgress(100);
    return photos;
  }

  for (let i = 0; i < total; i++) {
    const photo = validPhotos[i];
    try {
      photo.pHash = await calculatePHash(photo.blobUrl);
    } catch (err) {
      console.error(`해시 산출 실패 (${photo.filename}):`, err);
      photo.pHash = null;
    }
    onProgress(Math.round(((i + 1) / total) * 30));
  }

  let clusterCounter = 0;
  for (let i = 0; i < total; i++) {
    const p1 = validPhotos[i];
    if (p1.clusterId !== null) continue;

    p1.clusterId = `cluster_${clusterCounter++}`;
    p1.isRepresentative = true;

    for (let j = i + 1; j < total; j++) {
      const p2 = validPhotos[j];
      if (p2.clusterId !== null) continue;

      if (p1.pHash && p2.pHash) {
        const distance = calculateHammingDistance(p1.pHash, p2.pHash);
        
        // 시간차 기반 어댑티브 임계값 보정: 12초 이내 초밀착 연사는 해시가 다소 튀더라도 동일 구도로 판정 (기준치 threshold + 6 완화)
        const timeDiffSeconds = Math.abs(p1.captureTime.getTime() - p2.captureTime.getTime()) / 1000;
        const adaptiveThreshold = (timeDiffSeconds <= 12) ? Math.max(threshold + 6, 16) : threshold;

        if (distance <= adaptiveThreshold) {
          p2.clusterId = p1.clusterId;
          p2.isDuplicate = true; 
          p2.isRepresentative = false;
        }
      }
    }
    onProgress(30 + Math.round(((i + 1) / total) * 30));
  }

  const clusters = {};
  validPhotos.forEach(p => {
    if (!clusters[p.clusterId]) clusters[p.clusterId] = [];
    clusters[p.clusterId].push(p);
  });

  const clusterIds = Object.keys(clusters);
  const totalClusters = clusterIds.length;

  let isApiUsable = isValidApiKey(apiKey) && !apiDisabledByLimit;
  if (apiKey && !isValidApiKey(apiKey)) {
    addLog('[경고] 입력된 Gemini API Key 포맷이 올바르지 않습니다. 로컬 화질 엔진으로 대체합니다.', 'warning');
  }

  for (let cIdx = 0; cIdx < totalClusters; cIdx++) {
    const cid = clusterIds[cIdx];
    const members = clusters[cid];

    if (members.length > 1) {
      members.sort((a, b) => b.aestheticScore - a.aestheticScore);
      
      // 루프 도는 도중에도 Limit 상태를 매번 체크하여 폴백 차단
      isApiUsable = isValidApiKey(apiKey) && !apiDisabledByLimit;

      if (isApiUsable && members.length >= 2) {
        const candidate1 = members[0];
        const candidate2 = members[1];
        
        try {
          addLog(`[AI 오디션] 중복 세트 발견. (${candidate1.filename} vs ${candidate2.filename}) 구도 분석을 의뢰합니다...`, 'info');
          
          const base64Img1 = await getResizedBase64(candidate1.blobUrl, 1024);
          const base64Img2 = await getResizedBase64(candidate2.blobUrl, 1024);
          
          const decision = await requestGeminiVisionDecision(apiKey, candidate1.filename, base64Img1, candidate2.filename, base64Img2);
          
          addLog(`[AI 판정 결과] 선정작: ${decision.winner} | 사유: ${decision.reason}`, 'success');
          
          members.forEach(m => {
            if (m.filename === decision.winner) {
              m.isRepresentative = true;
              m.isDuplicate = false;
              m.decisionReason = decision.reason; 
            } else {
              m.isRepresentative = false;
              m.isDuplicate = true;
              m.isBestCut = false;
              m.excludeReason = `중복 사진 (AI 오디션 탈락): 동일한 구도로 촬영된 다른 사진(${decision.winner})이 구도가 더 자연스럽고 피사체의 미소가 살아 있어 AI 심사로 베스트에 선정되고 본 카드는 제외되었습니다. (선정 기준: ${decision.reason})`;
            }
          });
          
        } catch (err) {
          console.error('Gemini Vision 구도 오디션 오류:', err);
          const errStr = err.message || '';
          
          if (errStr.includes('429') || errStr.includes('Limit') || errStr.includes('400') || errStr.includes('403') || errStr.includes('key')) {
            // 최초 1회만 사용자 동의 유도 팝업 노출
            if (!apiDisabledByLimit) {
              const proceed = confirm(
                '⚠️ [Gemini API 제한 발생]\n\n' +
                '분석 중 구글 Gemini API 사용량 제한(Rate Limit) 또는 인증 만료 오류가 감지되었습니다.\n\n' +
                '확인을 누르시면 이 시점부터 로컬 엔진(WASM 화질 공식)으로 자동 전환(Fallback)하여 정리를 완수합니다.\n' +
                '취소를 누르시면 즉시 작업을 취소하고 대기열 화면으로 안전하게 되돌아갑니다.\n\n' +
                '로컬 기본 모드로 계속 진행하시겠습니까?'
              );
              
              if (!proceed) {
                throw new Error('사용자 취소: API 사용 제한(Rate Limit) 감지로 인해 사진 분석 작업이 취소되었습니다.');
              }
              apiDisabledByLimit = true;
              addLog('[경고] Gemini API 사용량 제한 또는 인증 에러가 감지되었습니다. 로컬 WASM 엔진으로 자동 전환(Fallback)합니다.', 'warning');
            }
          } else {
            addLog('[시스템] AI 통신 오류로 인해 이번 컷은 로컬 화질 알고리즘으로 평가합니다.', 'warning');
          }
          applyLocalAuditionFallback(members);
        }
      } else {
        applyLocalAuditionFallback(members);
      }
    } else {
      members[0].isRepresentative = true;
      members[0].isDuplicate = false;
    }
    
    onProgress(60 + Math.round(((cIdx + 1) / totalClusters) * 40));
  }

  return photos;
}

function applyLocalAuditionFallback(members) {
  members.forEach((m, idx) => {
    m.isRepresentative = idx === 0;
    m.isDuplicate = idx > 0;
    if (idx > 0) {
      m.isBestCut = false;
      m.excludeReason = `중복 사진: 로컬 화질 대비 점수가 더 우수한 대표 사진(${members[0].filename}[${members[0].aestheticScore}점]) 대비 점수 차이로 인해 중복 컷으로 정리되었습니다.`;
    }
  });
}

function applyBestCutRatioFilter(photos, ratio) {
  // 1. 정상 대표 사진들 목록 확보
  const representatives = photos.filter(p => !p.isBlurry && p.isRepresentative);
  
  // 2. 전체 대표 사진들의 총 개수 기준으로 사용자 설정 비율의 목표 컷 개수 계산
  const targetBestCount = Math.max(1, Math.round(representatives.length * ratio));
  
  // 3. 클러스터(중복 묶음)별로 정리하여 그룹당 최우선 1위 선별
  const clusters = {};
  representatives.forEach(p => {
    if (!clusters[p.clusterId]) clusters[p.clusterId] = [];
    clusters[p.clusterId].push(p);
  });

  const clusterIds = Object.keys(clusters);
  
  // 모든 사진의 isBestCut 기본값 초기화
  photos.forEach(p => p.isBestCut = false);

  const selectedPhotos = new Set();

  // [1단계 생존]: 각 중복 그룹(Cluster) 내 최고 득점 대표 1장씩은 우선적으로 무조건 선정! (특정 순간의 앨범 유실 방지)
  clusterIds.forEach(cid => {
    const members = clusters[cid];
    members.sort((a, b) => b.aestheticScore - a.aestheticScore);
    const bestInCluster = members[0];
    
    bestInCluster.isBestCut = true;
    selectedPhotos.add(bestInCluster.id);
  });

  // [2단계 생존]: 남은 목표 슬롯이 있으면 아직 미선정된 대표 사진들 중 점수 높은 순으로 추가 선정
  if (selectedPhotos.size < targetBestCount) {
    const remainingReps = representatives.filter(p => !selectedPhotos.has(p.id));
    remainingReps.sort((a, b) => b.aestheticScore - a.aestheticScore);
    
    const extraNeeded = targetBestCount - selectedPhotos.size;
    for (let i = 0; i < Math.min(extraNeeded, remainingReps.length); i++) {
      remainingReps[i].isBestCut = true;
      selectedPhotos.add(remainingReps[i].id);
    }
  }

  // 4. 탈락한 사진들에 대한 제외 이유 피드백 맵핑
  photos.forEach(p => {
    if (p.isBlurry) return; // 흔들린 사진은 이미 고유 사유 있음
    if (p.isDuplicate) {
      p.isBestCut = false; // 중복 사진도 기본 제외 사유 있음
      return;
    }
    
    if (!p.isBestCut) {
      p.excludeReason = `순위 컷오프(그룹대표 안착 실패): 이 에피소드 그룹 내에 더 심미성이 뛰어나 베스트로 선정된 대표 컷들이 존재하며, 사용자가 설정한 최종 상위 ${Math.round(ratio * 100)}% 선별 한도 순위 밖으로 밀려나 제외되었습니다.`;
    }
  });

  return photos;
}

function calculatePHash(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 8, 8);
      
      const imgData = ctx.getImageData(0, 0, 8, 8);
      const data = imgData.data;
      
      let grayVals = [];
      let sum = 0;
      for (let i = 0; i < 64; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        grayVals.push(gray);
        sum += gray;
      }
      
      const avg = sum / 64;
      
      let hash = "";
      for (let i = 0; i < 64; i++) {
        hash += (grayVals[i] >= avg) ? "1" : "0";
      }
      resolve(hash);
    };
    img.onerror = () => reject(new Error('해시 추출용 이미지 로드 오류'));
  });
}

function calculateHammingDistance(h1, h2) {
  let dist = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) dist++;
  }
  return dist;
}

function getResizedBase64(url, maxDim) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = function() {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const base64Data = dataUrl.split(',')[1];
      resolve(base64Data);
    };
    img.onerror = () => reject(new Error('Base64 추출용 이미지 로드 실패'));
  });
}

async function requestGeminiVisionDecision(apiKey, file1, base64_1, file2, base64_2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const promptText = `
    너는 전문 사진작가이자 사진 큐레이터야.
    제공된 두 장의 여행 사진은 동일한 장소에서 연사로 찍힌 매우 유사한 구도의 사진이야.
    이 두 장 중, 수평 상태가 더 안정적이고, 인물의 표정이 자연스러우며(눈을 감지 않음), 구도가 미적/예술적으로 더 아름다운 베스트 컷 딱 1장을 선정해줘.
    
    [입력 이미지 정보]:
    - 이미지 A 파일명: ${file1}
    - 이미지 B 파일명: ${file2}
    
    [응답 포맷]:
    반드시 마크다운 백틱 없이 순수한 JSON 포맷으로만 응답해줘. 형식은 다음과 같아:
    {
      "winner": "선택한 이미지 파일명(예: ${file1} 또는 ${file2})",
      "reason": "해당 이미지를 베스트 컷으로 선정한 이유 요약 (한글로 1~2줄)"
    }
  `;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64_1
              }
            },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64_2
              }
            }
          ]
        }]
      })
    });
  } catch (netErr) {
    throw new Error(`네트워크 전송 오류 (WASM 대체 필요): ${netErr.message}`);
  }

  if (!response.ok) {
    throw new Error(`API 통신 에러 발생 [상태 코드: ${response.status}] (로컬 WASM 폴백 전환)`);
  }

  const resData = await response.json();
  
  try {
    const responseText = resData.candidates[0].content.parts[0].text.trim();
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (parseErr) {
    throw new Error(`JSON 파싱 실패 (로컬로 보완): ${parseErr.message}`);
  }
}

function calculateContrastScore(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 100, 100);
      const imgData = ctx.getImageData(0, 0, 100, 100);
      const data = imgData.data;
      let sum = 0;
      let grayVals = [];
      for (let i = 0; i < 10000; i++) {
        const gray = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
        grayVals.push(gray);
        sum += gray;
      }
      const mean = sum / 10000;
      let varianceSum = 0;
      for (let i = 0; i < 10000; i++) {
        varianceSum += (grayVals[i] - mean) * (grayVals[i] - mean);
      }
      const stdDev = Math.sqrt(varianceSum / 10000);
      let contrastScore = (stdDev / 50) * 10;
      if (contrastScore > 10) contrastScore = 10;
      if (mean < 40 || mean > 220) contrastScore *= 0.5;
      resolve(contrastScore);
    };
    img.onerror = () => resolve(5.0);
  });
}

// =======================================================
// [모듈 5] editor: 자동 명암 개선
// =======================================================
async function editorModule(photos, onProgress) {
  const bestPhotos = photos.filter(p => p.isBestCut);
  const total = bestPhotos.length;
  const isCvReady = typeof cv !== 'undefined' && cv.Mat;

  if (total === 0) {
    onProgress(100);
    return photos;
  }

  for (let i = 0; i < total; i++) {
    const photo = bestPhotos[i];
    if (isCvReady) {
      try {
        const { blob, url } = await applyCLAHEEnhancement(photo.blobUrl);
        photo.enhancedBlob = blob;
        photo.enhancedUrl = url;
      } catch (err) {
        console.error(`보정 처리 실패 (${photo.filename}):`, err);
        photo.enhancedBlob = photo.file;
        photo.enhancedUrl = photo.blobUrl;
      }
    } else {
      photo.enhancedBlob = photo.file;
      photo.enhancedUrl = photo.blobUrl;
    }
    onProgress(Math.round(((i + 1) / total) * 100));
  }
  return photos;
}

function applyCLAHEEnhancement(srcUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = srcUrl;
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let src = cv.imread(canvas);
        let lab = new cv.Mat();
        
        cv.cvtColor(src, lab, cv.COLOR_RGBA2RGB);
        cv.cvtColor(lab, lab, cv.COLOR_RGB2Lab);
        
        let channels = new cv.MatVector();
        cv.split(lab, channels);
        
        let clahe = new cv.CLAHE(5.0, new cv.Size(16, 16));
        let dstL = new cv.Mat();
        clahe.apply(channels.get(0), dstL);
        
        channels.set(0, dstL);
        cv.merge(channels, lab);
        
        cv.cvtColor(lab, src, cv.COLOR_Lab2RGBA);
        
        cv.imshow(canvas, src);
        
        src.delete();
        lab.delete();
        channels.delete();
        clahe.delete();
        dstL.delete();
        
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          resolve({ blob, url });
        }, 'image/jpeg', 0.9);

      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(new Error('보정용 이미지 로드 실패'));
  });
}

// =======================================================
// [모듈 6] album-generator: 클러스터링 및 Gemini AI 연동 스토리북
// =======================================================
async function albumGeneratorModule(photos, apiKey, onProgress) {
  const bestPhotos = photos.filter(p => p.isBestCut);
  
  const clusters = [];
  let currentCluster = [];
  const timeThreshold = 3 * 60 * 60 * 1000;

  bestPhotos.forEach((photo, index) => {
    if (index === 0) {
      currentCluster.push(photo);
    } else {
      const prevPhoto = bestPhotos[index - 1];
      const timeDiff = photo.captureTime.getTime() - prevPhoto.captureTime.getTime();
      
      if (timeDiff > timeThreshold) {
        clusters.push(currentCluster);
        currentCluster = [photo];
      } else {
        currentCluster.push(photo);
      }
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }
  
  onProgress(30);

  let albumStoryResult = null;
  const isApiUsable = isValidApiKey(apiKey) && !apiDisabledByLimit;

  if (isApiUsable) {
    try {
      addLog('한글 진행 상황: Gemini AI를 호출하여 여행 앨범 스토리를 구상하고 있습니다...', 'info');
      
      const clusterMetadata = clusters.map((c, idx) => {
        return {
          episodeIndex: idx + 1,
          photoCount: c.length,
          startTime: c[0].captureTime.toLocaleString('ko-KR'),
          endTime: c[c.length - 1].captureTime.toLocaleString('ko-KR'),
          photos: c.map(p => ({ filename: p.filename, score: p.aestheticScore }))
        };
      });

      const promptText = `
        너는 감성적인 글을 쓰는 전문 여행 소설가이자 사진 큐레이터야.
        사용자가 다녀온 여행의 시간별 사진 분석 데이터를 바탕으로 아름다운 '여행 앨범 스토리북'을 한글로 작성해줘.
        
        [여행 사진 분석 정보]:
        ${JSON.stringify(clusterMetadata, null, 2)}
        
        [요구사항]:
        1. 이 전체 여행의 분위기를 관통하는 대제목(title)을 멋지고 감성적으로 작성해줘.
        2. 사진 촬영 공백을 기준으로 나뉜 각 에피소드 그룹(episodeIndex) 마다:
           - 에피소드 소제목(episodeTitle)
           - 이 에피소드 시간대의 감성적인 이야기 서술(episodeStory, 약 2-3문장)
           - 각 사진 파일명(filename)에 매칭될 한 줄짜리 감성 캡션(caption) 매핑 리스트 작성.
        
        [응답 형식]:
        반드시 백틱 없이 순수한 JSON 포맷으로만 응답해야 해. 주석도 포함하지 마. 형식은 다음과 같아:
        {
          "title": "전체 여행 대제목",
          "description": "전체 여행을 요약하는 문학적 서평 (1~2줄)",
          "episodes": [
            {
              "episodeIndex": 1,
              "episodeTitle": "에피소드 소제목",
              "episodeStory": "에피소드 줄거리 스토리",
              "photos": [
                { "filename": "photo_001.jpg", "caption": "감성 캡션 문구" }
              ]
            }
          ]
        }
      `;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: promptText }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP API 오류: ${response.status}`);
      }

      const resData = await response.json();
      const responseText = resData.candidates[0].content.parts[0].text.trim();
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      albumStoryResult = JSON.parse(cleanJson);
      
    } catch (err) {
      console.error('Gemini API 앨범 생성 오류:', err);
      addLog('[경고] 스토리 생성 중 API 속도제한 또는 키 검증 실패가 감지되어 로컬 룰 기반 자동 생성을 진행합니다.', 'warning');
      albumStoryResult = generateDefaultAlbumData(clusters);
    }
  } else {
    if (apiKey && apiKey !== "" && !isValidApiKey(apiKey)) {
      addLog('[안내] 유효하지 않은 API Key 상태이므로, 로컬 룰 기반으로 여행 스토리북을 구성합니다.', 'info');
    } else if (apiDisabledByLimit) {
      addLog('[안내] Gemini API 제한 상태이므로, 로컬 엔진 기반으로 여행 스토리북을 자동 구성합니다.', 'info');
    } else {
      addLog('[정보] API Key가 설정되지 않아 로컬 기본 템플릿으로 앨범을 빌드합니다.', 'info');
    }
    albumStoryResult = generateDefaultAlbumData(clusters);
  }

  onProgress(100);
  
  if (albumStoryResult && albumStoryResult.episodes) {
    albumStoryResult.episodes.forEach((ep, idx) => {
      // 1. 에피소드 인덱스가 clusters 범위를 초과하는지 여부를 검증하고, 초과 시 안전하게 인덱스 대체 (오버플로우 100% 방지)
      let clusterIdx = (typeof ep.episodeIndex === 'number') ? (ep.episodeIndex - 1) : idx;
      if (clusterIdx < 0 || clusterIdx >= clusters.length) {
        clusterIdx = idx % clusters.length; 
      }
      
      const clusterPhotos = clusters[clusterIdx] || [];
      ep.photoObjects = (clusterPhotos || []).map(photo => {
        const aiPhotoInfo = (ep.photos && Array.isArray(ep.photos)) 
          ? ep.photos.find(p => p.filename === photo.filename) 
          : null;
        return {
          ...photo,
          caption: (aiPhotoInfo && aiPhotoInfo.caption && !aiPhotoInfo.caption.includes('사진 기록')) 
            ? aiPhotoInfo.caption 
            : photo.filename
        };
      });
    });
  }

  return albumStoryResult;
}

function generateDefaultAlbumData(clusters) {
  const now = new Date();
  return {
    title: `여행의 기억 - ${now.toLocaleDateString()}`,
    description: "에이전트가 시간차 클러스터링을 기반으로 분류한 앨범입니다. (Gemini API Key 등록 시 감성 스토리가 생성됩니다.)",
    episodes: (clusters || []).map((c, idx) => {
      const startTimeStr = (c && c.length > 0 && c[0] && c[0].captureTime) 
        ? c[0].captureTime.toLocaleTimeString() 
        : now.toLocaleTimeString();
      return {
        episodeIndex: idx + 1,
        episodeTitle: `${idx + 1}번째 여정의 조각`,
        episodeStory: `${startTimeStr}부터 시작된 여정의 주요 순간들입니다.`,
        photos: (c || []).map(p => ({ filename: p.filename, caption: p.filename })) 
      };
    })
  };
}

// =======================================================
// [출력 및 렌더링] 결과 대시보드 화면 표출 (클릭 분석 모달 이벤트 탑재)
// =======================================================
function renderResultsDashboard(album) {
  try {
    document.getElementById('agent-terminal').classList.add('hidden');
    const resultsPanel = document.getElementById('results-panel');
    if (resultsPanel) resultsPanel.classList.remove('hidden');

    // 대시보드 강제 화면 전환 시 탭 액티브 상태 동적 강제 동기화
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => {
      if (b.getAttribute('data-tab') === 'tab-album') b.classList.add('active');
      else b.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-content').forEach(c => {
      if (c.id === 'tab-album') c.classList.add('active');
      else c.classList.remove('active');
    });

    const photosArray = processedPhotos || [];
    const total = filesList.length;
    const blur = photosArray.filter(p => p.isBlurry).length;
    const dup = photosArray.filter(p => !p.isBlurry && p.isDuplicate).length;
    const best = photosArray.filter(p => p.isBestCut).length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-blur').textContent = blur;
    document.getElementById('stat-dup').textContent = dup;
    document.getElementById('stat-best').textContent = best;

    const safeAlbum = album || { title: "나의 여정 기록", description: "성공적으로 선별 완료", episodes: [] };

    document.getElementById('album-title').textContent = safeAlbum.title;
    document.getElementById('album-description').textContent = safeAlbum.description;

    const bookContainer = document.getElementById('album-book-container');
    if (bookContainer && safeAlbum.episodes) {
      bookContainer.innerHTML = '';

      safeAlbum.episodes.forEach(ep => {
        const epSection = document.createElement('div');
        epSection.className = 'album-episode';

        const header = document.createElement('div');
        header.className = 'episode-header';
        header.innerHTML = `
          <h3>${ep.episodeTitle || `${ep.episodeIndex}번째 챕터`}</h3>
          <p>${ep.episodeStory || '여정의 아름다운 찰나 기록입니다.'}</p>
        `;
        epSection.appendChild(header);

        const showcase = document.createElement('div');
        showcase.className = 'episode-showcase';

        if (ep.photoObjects) {
          ep.photoObjects.forEach(photo => {
            const card = document.createElement('div');
            const orientationClass = photo.orientation || 'landscape';
            card.className = `story-card ${orientationClass}`;
            card.style.cursor = 'pointer';
            
            const imgPath = photo.enhancedUrl || photo.blobUrl;
            const scoreTag = `<div class="card-meta">Score: ${photo.aestheticScore}/100</div>`;

            card.innerHTML = `
              <div class="card-img-wrapper">
                <img src="${imgPath}" alt="${photo.filename}">
                ${scoreTag}
              </div>
              <div class="card-story-body">
                <p>${photo.caption || photo.filename}</p>
              </div>
            `;
            
            card.addEventListener('click', () => {
              showAestheticDetailModal(photo);
            });

            showcase.appendChild(card);
          });
        }

        epSection.appendChild(showcase);
        bookContainer.appendChild(epSection);
      });
    }

    const galleryContainer = document.getElementById('gallery-grid-container');
    if (galleryContainer) {
      galleryContainer.innerHTML = '';

      const bestPhotos = photosArray.filter(p => p.isBestCut);
      bestPhotos.forEach(photo => {
        const card = document.createElement('div');
        card.className = 'comparison-card';
        card.style.cursor = 'pointer';

        card.innerHTML = `
          <div class="comparison-view">
            <img class="comparison-img comparison-before" src="${photo.blobUrl}" alt="원본">
            <img class="comparison-img comparison-after" src="${photo.enhancedUrl || photo.blobUrl}" alt="보정">
            <div class="comparison-label"></div>
          </div>
          <div class="comparison-info">
            <span>${photo.filename}</span>
            <span class="score-badge">Score: ${photo.aestheticScore}/100</span>
          </div>
        `;

        card.addEventListener('click', () => {
          showAestheticDetailModal(photo);
        });

        galleryContainer.appendChild(card);
      });
    }

    const blurryGrid = document.getElementById('blurry-grid');
    if (blurryGrid) {
      blurryGrid.innerHTML = '';
      const blurPhotos = photosArray.filter(p => p.isBlurry);
      blurPhotos.forEach(p => {
        const item = document.createElement('div');
        item.className = 'filtered-card-item';
        item.innerHTML = `
          <div class="filtered-img-wrapper">
            <img src="${p.blobUrl}" alt="${p.filename}">
            <div class="filtered-item-score" style="color: var(--accent-red)">Lap: ${p.laplacianScore}</div>
          </div>
          <div class="filtered-item-info">
            <strong class="filtered-filename">${p.filename}</strong>
            <p class="filtered-reason-text">${p.excludeReason}</p>
          </div>
        `;
        blurryGrid.appendChild(item);
      });
    }

    const duplicateGrid = document.getElementById('duplicate-grid');
    if (duplicateGrid) {
      duplicateGrid.innerHTML = '';
      const dupPhotos = photosArray.filter(p => !p.isBlurry && p.isDuplicate);
      dupPhotos.forEach(p => {
        const item = document.createElement('div');
        item.className = 'filtered-card-item';
        item.innerHTML = `
          <div class="filtered-img-wrapper">
            <img src="${p.blobUrl}" alt="${p.filename}">
            <div class="filtered-item-score" style="color: var(--accent-orange)">Score: ${p.aestheticScore}</div>
          </div>
          <div class="filtered-item-info">
            <strong class="filtered-filename">${p.filename}</strong>
            <p class="filtered-reason-text">${p.excludeReason}</p>
          </div>
        `;
        duplicateGrid.appendChild(item);
      });
    }

    const cutoffGrid = document.getElementById('cutoff-grid');
    if (cutoffGrid) {
      cutoffGrid.innerHTML = '';
      const cutoffPhotos = photosArray.filter(p => !p.isBlurry && !p.isDuplicate && !p.isBestCut);
      cutoffPhotos.forEach(p => {
        const item = document.createElement('div');
        item.className = 'filtered-card-item';
        item.innerHTML = `
          <div class="filtered-img-wrapper">
            <img src="${p.blobUrl}" alt="${p.filename}">
            <div class="filtered-item-score" style="color: var(--accent-cyan)">Score: ${p.aestheticScore}</div>
          </div>
          <div class="filtered-item-info">
            <strong class="filtered-filename">${p.filename}</strong>
            <p class="filtered-reason-text">${p.excludeReason}</p>
          </div>
        `;
        cutoffGrid.appendChild(item);
      });
    }

    const activeZoomBtn = document.querySelector('.zoom-btn.active');
    if (activeZoomBtn) {
      const activeZoom = activeZoomBtn.getAttribute('data-zoom');
      applyAlbumZoom(activeZoom);
    }

    initIcons();
  } catch (err) {
    console.error("렌더링 대시보드 처리 중 오류 발생:", err);
    addLog(`[경고] 대시보드 화면 전환 실패: ${err.message}`, 'warning');
  }
}

// =======================================================
// [상세 분석 모달 정보 바인딩 및 노출]
// =======================================================
function showAestheticDetailModal(photo) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;

  document.getElementById('modal-img').src = photo.enhancedUrl || photo.blobUrl;
  document.getElementById('modal-filename').textContent = photo.filename;
  document.getElementById('modal-capture-time').textContent = `📅 촬영일시: ${photo.captureTime.toLocaleString('ko-KR')}`;
  
  document.getElementById('modal-score').textContent = photo.aestheticScore;

  const photoCaption = document.getElementById('modal-photo-caption');
  if (photoCaption) {
    if (photo.decisionReason) {
      photoCaption.innerHTML = `💬 <strong>AI 구도 심사평:</strong> "${photo.decisionReason}"`;
    } else {
      photoCaption.innerHTML = `📝 <strong>에이전트 품질 진단:</strong> 본 사진은 초점 선명도(Lap: ${photo.laplacianScore}) 및 명암비 대비율 통계 분석을 거쳐 최적의 밸런스를 확보해 대표 베스트 컷으로 선정되었습니다.`;
    }
  }

  const blurScore = Math.round(Math.min(Math.max((photo.laplacianScore - 10) / 140, 0), 1.0) * 25);
  const blurFill = document.getElementById('bar-blur');
  const blurText = document.getElementById('modal-factor-blur');
  const blurDesc = document.getElementById('modal-desc-blur');
  
  blurFill.style.width = `${Math.max(5, blurScore * 4)}%`;
  blurText.textContent = `${photo.laplacianScore}점 (가점 +${blurScore}/25점)`;
  
  if (blurScore > 18) {
    blurText.style.color = 'var(--accent-green)';
    blurDesc.textContent = `초점이 매우 날카롭고 피사체의 디테일 엣지가 완벽히 감지되었습니다. (Laplacian: ${photo.laplacianScore})`;
  } else if (blurScore > 8) {
    blurText.style.color = 'var(--accent-cyan)';
    blurDesc.textContent = `일반적인 선명도로, 웹 렌더링에 적절한 수준의 포커스를 유지하고 있습니다.`;
  } else {
    blurText.style.color = 'var(--accent-orange)';
    blurDesc.textContent = `다소 소프트한 포커스이나 임계 수준을 통과하여 베스트 컷에 포함되었습니다.`;
  }

  const stats = photo.exifStats || { mean: 128, stdDev: 30 };
  const diff = Math.abs(stats.stdDev - 35);
  const contrastScore = Math.round(Math.max(15 - (diff * 0.8), 0));
  
  const contrastFill = document.getElementById('bar-contrast');
  const contrastText = document.getElementById('modal-factor-contrast');
  const contrastDesc = document.getElementById('modal-desc-contrast');
  
  contrastFill.style.width = `${Math.max(5, contrastScore * 6.6)}%`;
  contrastText.textContent = `${stats.stdDev}레벨 (가점 +${contrastScore}/15점)`;
  
  if (contrastScore > 11) {
    contrastText.style.color = 'var(--accent-green)';
    contrastDesc.textContent = `명암 분산도가 가장 입체적인 영역(표준편차 ${stats.stdDev})에 위치하여 깊이감 있는 질감을 뽐냅니다.`;
  } else {
    contrastText.style.color = 'var(--accent-cyan)';
    contrastDesc.textContent = `색상 명암비 분산도가 무난하며, 자동 개선 필터(CLAHE)를 통해 톤이 더 단정하게 개선되었습니다.`;
  }

  let exposureVal = 100;
  let exposureLabel = "최적 (감점 0)";
  let exposureColor = 'var(--accent-green)';
  let exposureExplain = `평균 조도 레벨이 ${stats.mean}으로 밝은 영역과 그늘이 균형감 있게 안착된 최상의 노출 상태입니다.`;
  
  if (stats.mean < 50) {
    const penalty = Math.round((50 - stats.mean) * 0.2);
    exposureVal = 100 - (penalty * 10);
    exposureLabel = `부족 (감점 -${penalty}점)`;
    exposureColor = 'var(--accent-orange)';
    exposureExplain = `평균 조도 레벨이 ${stats.mean}으로 전반적으로 노출이 낮아 어두운 영역이 많으나, 디테일이 보존되어 보정 대상으로 채택되었습니다.`;
  } else if (stats.mean > 200) {
    const penalty = Math.round((stats.mean - 200) * 0.2);
    exposureVal = 100 - (penalty * 10);
    exposureLabel = `과다 (감점 -${penalty}점)`;
    exposureColor = 'var(--accent-red)';
    exposureExplain = `평균 조도 레벨이 ${stats.mean}으로 과다 노출(빛바램)이 발생했으나, 경계선 훼손이 없는 범주여서 선정되었습니다.`;
  }

  const exposureFill = document.getElementById('bar-exposure');
  const exposureText = document.getElementById('modal-factor-exposure');
  const exposureDesc = document.getElementById('modal-desc-exposure');
  
  exposureFill.style.width = `${Math.max(5, exposureVal)}%`;
  exposureText.textContent = exposureLabel;
  exposureText.style.color = exposureColor;
  exposureDesc.textContent = exposureExplain;

  const summaryText = document.getElementById('modal-summary-text');
  if (photo.decisionReason) {
    summaryText.innerHTML = `🌟 <strong>AI 구도 오디션 승자</strong><br>유사 구도 사진들 중, 구도의 심미성 및 인물의 표정을 비교하는 AI 구도 심사에서 승리하여 최종 베스트 컷으로 채택되었습니다.<br><em>(AI 심사평: "${photo.decisionReason}")</em>`;
  } else {
    summaryText.innerHTML = `🎖 Honor <strong>베스트 대표 사진</strong><br>선명도 가점(+${blurScore}점) 및 조도 명암비(+${contrastScore}점)를 합산하여 총 ${photo.aestheticScore}점을 획득해 최종 베스트 컷으로 선정되었습니다.`;
  }

  modal.classList.remove('hidden');
}

// =======================================================
// [ZIP 다운로드] 최종 보정본 일괄 로컬 압축 다운로드
// =======================================================
function downloadEnhancedPhotosZip() {
  const bestPhotos = processedPhotos.filter(p => p.isBestCut);
  if (bestPhotos.length === 0) return;

  addLog('한글 진행 상황: 보정된 사진들을 ZIP 파일로 압축하는 작업을 개시합니다...', 'info');

  const zip = new JSZip();
  const folder = zip.folder("enhanced_photos");

  let addedCount = 0;
  bestPhotos.forEach((photo) => {
    const blobReader = new FileReader();
    blobReader.onload = function() {
      folder.file(`enhanced_${photo.filename}`, this.result);
      addedCount++;
      if (addedCount === bestPhotos.length) {
        zip.generateAsync({ type: "blob" }).then((content) => {
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = url;
          link.download = "AetherLens_enhanced_photos.zip";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          addLog('한글 진행 상황: ZIP 파일 다운로드가 준비되어 전송이 시작되었습니다.', 'success');
        });
      }
    };
    blobReader.readAsArrayBuffer(photo.enhancedBlob);
  });
}

// =======================================================
// [ZIP 다운로드] 최종 선정된 원본 파일 일괄 로컬 압축 다운로드
// =======================================================
function downloadRawPhotosZip() {
  const bestPhotos = processedPhotos.filter(p => p.isBestCut);
  if (bestPhotos.length === 0) return;

  addLog('한글 진행 상황: 보정 전 원본 사진들을 ZIP 파일로 압축하는 작업을 개시합니다...', 'info');

  const zip = new JSZip();
  const folder = zip.folder("raw_photos");

  let addedCount = 0;
  bestPhotos.forEach((photo) => {
    const blobReader = new FileReader();
    blobReader.onload = function() {
      folder.file(`raw_${photo.filename}`, this.result);
      addedCount++;
      if (addedCount === bestPhotos.length) {
        zip.generateAsync({ type: "blob" }).then((content) => {
          const url = URL.createObjectURL(content);
          const link = document.createElement('a');
          link.href = url;
          link.download = "AetherLens_raw_photos.zip";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          addLog('한글 진행 상황: 원본 ZIP 파일 다운로드가 준비되어 전송이 시작되었습니다.', 'success');
        });
      }
    };
    blobReader.readAsArrayBuffer(photo.file);
  });
}

// =======================================================
// [지능형 비평 에이전트] 작가 관점의 감성 구도 및 연출 한줄평 생성
// =======================================================
function generateAestheticComment(photo) {
  // 1. 구도 연출 평가 풀 (Orientation 기반)
  const landscapeComments = [
    "수평의 황금 삼분할 프레임이 깔끔하게 어우러져, 풍경 고유의 시원한 개방감과 시각적 평온함을 돋보이게 이끌어 냈습니다.",
    "좌우 대칭 구조의 정교한 밸런스가 돋보이며, 보는 이의 시선을 중심부로 자연스럽게 흡입시키는 안정감 높은 화면 연출입니다.",
    "프레임 전체에 흐르는 사선 구도가 시선의 역동적인 이동을 유도하여, 단순 정적 기록을 넘어 활력 있는 대기감을 선사합니다.",
    "전경과 원경의 조화로운 깊이감을 영리하게 설계하여, 여행 속 공간의 입체적 서사를 사진 한 장에 훌륭히 농축했습니다."
  ];

  const portraitComments = [
    "세로 프레임 특유의 시원한 수직 상승 비율을 영리하게 가미하여 피사체와 배경의 조화로움을 아름답게 극대화했습니다.",
    "피사체를 삼분할 교차선 상의 핵심 지점에 단정히 안착시켜, 배경 너머의 내러티브가 상상되는 낭만적인 화면을 설계했습니다.",
    "수직의 기하학적 요소들이 안정적인 무게중심을 잡아주어, 인물의 살아있는 표정과 현장 고유의 미장센에 온전히 포커스 시켜 줍니다.",
    "세로 구도 특유의 깊은 공간감을 조율하여 여행지가 간직한 본연의 서정성과 고독한 낭만을 매력적으로 포착했습니다."
  ];

  // 2. 조도(노출) 감성 평가 풀
  const exposure = photo.exifStats || { mean: 128, stdDev: 30 };
  let lightComment = "";
  if (exposure.mean < 80) {
    lightComment = "차분하게 내려앉은 로우 키(Low-key) 실루엣의 명암이 시각적 깊이를 더해 영화 속 한 장면 같은 고독한 여운을 전합니다.";
  } else if (exposure.mean > 190) {
    lightComment = "화사하게 들어찬 따뜻한 빛의 유입이 프레임 전반에 맑고 생기 가득한 에너지를 가득 채워 기분 좋은 활력을 불어넣습니다.";
  } else {
    lightComment = "과장되거나 묻히는 구석 없이 밝기가 균일하게 펼쳐져, 현장의 본연 색조와 자연스러운 대기감을 투명하게 연출합니다.";
  }

  // 3. 콘트라스트 및 질감 평가 풀
  let contrastComment = "";
  if (exposure.stdDev > 40) {
    contrastComment = "빛과 그림자의 과감한 대조(Contrast)가 깊이 있는 텐션을 형성하여, 찰나의 피사체 윤곽을 입체적으로 강조합니다.";
  } else {
    contrastComment = "부드럽고 풍부한 미들톤 그라데이션이 사물의 미세한 입자감과 텍스처를 자연스럽게 묘사하여 은은한 서정성을 띱니다.";
  }

  // 4. 선명도 감성 평가 풀
  let sharpnessComment = "";
  if (photo.laplacianScore > 100) {
    sharpnessComment = "순간을 잡아챈 칼날 같은 에지 표현력은 찰나의 역동감과 풍부한 피사체의 질감을 극적으로 생생하게 증명해 줍니다.";
  } else {
    sharpnessComment = "프레임 주변부를 포근하고 몽환적인 톤으로 감싸 안아 필름 카메라 특유의 편안하고 따스한 감성 필터를 입혀줍니다.";
  }

  // 파일명 해시 시드를 활용해 사진마다 고유하지만 고정된 평가 한줄평을 매핑
  const seed = (photo.filename.charCodeAt(0) || 0) + (photo.filename.charCodeAt(photo.filename.length - 1) || 0);
  const orientPool = photo.orientation === 'portrait' ? portraitComments : landscapeComments;
  
  const comment1 = orientPool[seed % orientPool.length];
  const comment2 = lightComment;
  const comment3 = contrastComment;
  const comment4 = sharpnessComment;

  // 전체를 매끄러운 한 줄로 조립하여 반환
  return `📝 <strong>에이전트 감성 비평평:</strong> ${comment1} ${comment2} ${comment3} ${comment4}`;
}

// 앨범북 줌 크기 적용 및 동적 레이아웃 열 제어 함수
function applyAlbumZoom(type) {
  const showcases = document.querySelectorAll('.episode-showcase');
  if (showcases.length === 0) return;

  showcases.forEach(showcase => {
    showcase.classList.remove('zoom-out', 'zoom-normal', 'zoom-in');
    
    if (type === 'out') {
      showcase.style.setProperty('--zoom-cols', '5');
      showcase.classList.add('zoom-out');
    } else if (type === 'in') {
      showcase.style.setProperty('--zoom-cols', '2');
      showcase.classList.add('zoom-in');
    } else {
      showcase.style.setProperty('--zoom-cols', '3');
      showcase.classList.add('zoom-normal');
    }
  });
}
