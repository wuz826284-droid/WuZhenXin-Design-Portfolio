/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from "motion/react";
import { 
  Fingerprint,
  ArrowRight, 
  Smile,
  MapPin, 
  GraduationCap, 
  Mail, 
  Phone,
  Github, 
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Pin,
  MessageSquare,
  X,
  Upload,
  Download
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "motion/react";
import defaultOverrides from "./image-overrides.json";
import portfolioItems from "./portfolio-data.json";
import { isFirebaseEnabled } from "./firebase";
import {
  fetchLivePortfolio,
  saveFullPortfolio,
  fetchLiveOverrides,
  saveLiveOverride
} from "./firebaseSync";

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerChildren = {
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

const compressImage = (base64Str: string, maxDimension = 2400, quality = 0.92): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }
    
    // Extract original mime type if possible to preserve transparency or format
    const mimeMatch = base64Str.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    const originalMime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const usePng = originalMime === "image/png" || originalMime === "image/gif";
    
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // Only scale down if the image is extremely huge (e.g. greater than 2400px on any side)
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      } else {
        // If the size is already reasonable, do not downscale to preserve pixel-perfect sharpness
        resolve(base64Str);
        return;
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (ctx) {
        if (!usePng) {
          // Fill canvas with white background for JPEGs
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // Output format matching original with highest visual preservation
        if (usePng) {
          resolve(canvas.toDataURL("image/png"));
        } else {
          resolve(canvas.toDataURL("image/jpeg", quality));
        }
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
};

const ImageUploadOverlay = ({ 
  originalUrl, 
  onUploaded 
}: { 
  originalUrl: string; 
  onUploaded: (uploadedUrl: string) => void;
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Content = reader.result as string;
      
      try {
        // 1. Perform high-efficiency canvas compression in client
        const compressedBase64 = await compressImage(base64Content);
        
        // 2. Set the compressed base64 as the persistent override (immediate client preview)
        onUploaded(compressedBase64);
        
        // 3. Simultaneously upload the compressed version to server to write to container static disk
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name.endsWith(".png") || file.name.endsWith(".jpg") || file.name.endsWith(".jpeg") ? file.name : "uploaded.jpg",
            fileContent: compressedBase64,
            originalUrl: originalUrl
          })
        });
        
        if (response.ok) {
          const contentType = response.headers.get("Content-Type");
          if (contentType && contentType.includes("json")) {
            const data = await response.json();
            if (data.success && data.relativeUrl) {
              console.log("Compressed image saved on current live server instance:", data.relativeUrl);
              // Replace the temporary base64 with the permanent server relative path so it is durable for all users
              onUploaded(data.relativeUrl);
            }
          } else {
            console.warn("Upload response is not JSON. Falling back to local Base64 storage.");
          }
        } else {
          console.warn("Server upload endpoint returned error status. Falling back to local Base64 storage.");
        }
      } catch (err) {
        console.error("Compression or upload process failed:", err);
      } finally {
        setIsUploading(false);
      }
    };
    
    reader.readAsDataURL(file);
  };

  return (
    <div 
      className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-40 pointer-events-auto" 
      onClick={(e) => e.stopPropagation()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
      <button
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={isUploading}
        className="px-4 py-2 bg-[#D9FF33] text-black font-black text-[11px] uppercase tracking-wider rounded-md flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-[#D9FF33]/30 cursor-pointer"
      >
        <Upload className="w-3.5 h-3.5 shrink-0" />
        <span>{isUploading ? "正在上传及压缩..." : "更换图片 REPLACE"}</span>
      </button>
    </div>
  );
};

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("wujiao_portfolio_image_overrides");
      const localSaved = saved ? JSON.parse(saved) : {};
      return { ...defaultOverrides, ...localSaved };
    } catch (e) {
      return { ...defaultOverrides };
    }
  });

  // Dynamic state for portfoliowise global synchronization
  const [projects, setProjects] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("wujiao_portfolio_projects");
      return saved ? JSON.parse(saved) : portfolioItems;
    } catch (e) {
      return portfolioItems;
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showStaticSaveModal, setShowStaticSaveModal] = useState(false);

  // Password Authentication Dialog control states
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Sub Project Text Edit control states
  const [editingSubProjectIdx, setEditingSubProjectIdx] = useState<number | null>(null);
  const [editingSubProject, setEditingSubProject] = useState<any | null>(null);

  // Hidden references for uploading and parsing images
  const subProjectImgInputRef = useRef<HTMLInputElement>(null);

  // GET Overrides on start and portfolio synchronizer sync
  useEffect(() => {
    const bootstrapData = async () => {
      // 1. Fetch overrides
      let baseOverrides = { ...defaultOverrides };
      try {
        const res = await fetch("/api/overrides");
        if (res.ok) {
          const contentType = res.headers.get("Content-Type");
          if (contentType && contentType.includes("json")) {
            const serverData = await res.json();
            if (serverData && typeof serverData === "object") {
              baseOverrides = { ...baseOverrides, ...serverData };
            }
          }
        }
      } catch (err) {
        console.log("Local static overrides loaded:", err);
      }

      if (isFirebaseEnabled) {
        try {
          const liveDocOverrides = await fetchLiveOverrides(baseOverrides);
          setImageOverrides((prev) => {
            const merged = { ...prev, ...liveDocOverrides };
            try {
              localStorage.setItem("wujiao_portfolio_image_overrides", JSON.stringify(merged));
            } catch (e) {
              console.error(e);
            }
            return merged;
          });
        } catch (err) {
          console.warn("Firestore overrides sync failed, using static values:", err);
        }
      } else {
        setImageOverrides((prev) => {
          const merged = { ...prev, ...baseOverrides };
          try {
            localStorage.setItem("wujiao_portfolio_image_overrides", JSON.stringify(merged));
          } catch (e) {
            console.error(e);
          }
          return merged;
        });
      }

      // 2. Fetch live global portfolio database
      if (isFirebaseEnabled) {
        try {
          const dbPortfolio = await fetchLivePortfolio(portfolioItems);
          setProjects(dbPortfolio);
        } catch (err) {
          console.warn("Firestore portfolio fetch failed, falling back to JSON:", err);
        }
      } else {
        try {
          const res = await fetch("/api/portfolio");
          if (res.ok) {
            const contentType = res.headers.get("Content-Type");
            if (contentType && contentType.includes("json")) {
              const serverData = await res.json();
              if (Array.isArray(serverData)) {
                setProjects(serverData);
                try {
                  localStorage.setItem("wujiao_portfolio_projects", JSON.stringify(serverData));
                } catch (e) {
                  console.error(e);
                }
              }
            }
          }
        } catch (err) {
          console.log("Failed loading portfolio database from backend, using local defaults:", err);
        }
      }
    };

    bootstrapData();
  }, []);

  const getOverriddenImg = (url: string): string => {
    if (!url) return "";
    if (url.startsWith("data:")) return url;

    const withSlash = url.startsWith("/") ? url : "/" + url;
    const withoutSlash = url.startsWith("/") ? url.slice(1) : url;

    const override = imageOverrides[withSlash] || imageOverrides[withoutSlash] || imageOverrides[url];
    if (override) {
      if (override.startsWith("data:")) return override;
      return override.startsWith("/") ? override : "/" + override;
    }

    // High-fidelity fallback mapping for missing files to avoid broken frames
    const fallbacks: Record<string, string> = {
      "hero_portrait_________1.png": "uploaded_1779532213160_____________________________________________________.png",
      "uploaded_1779532544605_________2.png": "wanxin_brochure_cover_1779499128765.png",
      "uploaded_1779532588777______.png": "regenerated_image_1779409817532.png",
      "uploaded_1779532612188______2.png": "regenerated_image_1779409823567.png",
      "uploaded_1779532638297_Mockup.png": "regenerated_image_1779409850202.png",
      "uploaded_1779532671847_Mockup3.png": "regenerated_image_1779409532178.png",
      "uploaded_1779532701610_Mockup2.png": "regenerated_image_1779409373917.png",
      "uploaded_1779532730664_Mockup3.png": "regenerated_image_1779409409989.png",
      "uploaded_1779532775470_Mockup2.png": "regenerated_image_1779446667775.png",
      "uploaded_1779532855258_Mockup.png": "wanxin_brochure_cover_1779499128765.png",
      "uploaded_1779532890917_Landscape.png": "uploaded_1779532213160_____________________________________________________.png",
      "uploaded_1779532934231_Mockup.png": "regenerated_image_1779409817532.png"
    };

    const parts = withoutSlash.split("/");
    const filename = parts[parts.length - 1];
    if (fallbacks[filename]) {
      return `/assets/images/${fallbacks[filename]}`;
    }

    return withSlash;
  };

  const handleImageUploaded = async (originalUrl: string, uploadedUrl: string) => {
    const updated = { ...imageOverrides, [originalUrl]: uploadedUrl };
    setImageOverrides(updated);
    try {
      localStorage.setItem("wujiao_portfolio_image_overrides", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save overrides:", e);
    }

    if (isFirebaseEnabled) {
      try {
        await saveLiveOverride(originalUrl, uploadedUrl);
      } catch (err) {
        console.error("Failsafe firestore override propagation bypassed:", err);
      }
    }
  };

  // POST Global synchronizer
  const savePortfolio = async (updatedProjects: any[]) => {
    setIsSaving(true);
    setProjects(updatedProjects);
    try {
      localStorage.setItem("wujiao_portfolio_projects", JSON.stringify(updatedProjects));
    } catch (e) {
      console.error("Failed to save projects to localStorage:", e);
    }

    try {
      // 1. Sync with Firestore first (single source of truth)
      let firestoreSuccess = false;
      if (isFirebaseEnabled) {
        try {
          firestoreSuccess = await saveFullPortfolio(updatedProjects);
        } catch (err) {
          console.error("Firestore persistence failed:", err);
        }
      }

      // 2. Fallback upload to server backend (writes to file if on local or backup)
      let apiSuccess = false;
      try {
        const response = await fetch("/api/portfolio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: "Wuzhenxin123",
            data: updatedProjects,
          }),
        });
        if (response.ok) {
          const contentType = response.headers.get("Content-Type");
          if (contentType && contentType.includes("json")) {
            const data = await response.json();
            if (data.success) {
              apiSuccess = true;
            }
          }
        }
      } catch (err) {
        console.warn("Portfolio server API bypassed (running in static fallback mode):", err);
      }
      
      if (!apiSuccess && !firestoreSuccess) {
        console.log("Portfolio synced successfully to client localStorage.");
      }
    } catch (e: any) {
      console.error("Sync backup failed:", e);
    } finally {
      setIsSaving(false);
    }
  };

  // POST Global Save of Portfolio Data & Image Overrides
  const saveAllChanges = async () => {
    setIsSaving(true);
    let overridesSuccess = false;
    let portfolioSuccess = false;
    let firestoreSuccess = false;

    try {
      // 1. Save locally first to guarantee absolute preservation in current session
      try {
        localStorage.setItem("wujiao_portfolio_image_overrides", JSON.stringify(imageOverrides));
        localStorage.setItem("wujiao_portfolio_projects", JSON.stringify(projects));
      } catch (e) {
        console.error("localStorage replication failed:", e);
      }

      // 2. Sync Image Overrides to Server
      try {
        const overridesResponse = await fetch("/api/overrides", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: "Wuzhenxin123",
            overrides: imageOverrides,
          }),
        });
        if (overridesResponse.ok) {
          const contentType = overridesResponse.headers.get("Content-Type");
          if (contentType && contentType.includes("json")) {
            const overridesResult = await overridesResponse.json();
            overridesSuccess = !!overridesResult.success;
          }
        }
      } catch (err) {
        console.warn("Overrides server API failed (likely running on static host like Netlify):", err);
      }

      // 3. Sync Portfolio Data to Server
      try {
        const portfolioResponse = await fetch("/api/portfolio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            password: "Wuzhenxin123",
            data: projects,
          }),
        });
        if (portfolioResponse.ok) {
          const contentType = portfolioResponse.headers.get("Content-Type");
          if (contentType && contentType.includes("json")) {
            const portfolioResult = await portfolioResponse.json();
            portfolioSuccess = !!portfolioResult.success;
          }
        }
      } catch (err) {
        console.warn("Portfolio server API failed (likely running on static host like Netlify):", err);
      }

      // 4. Sync with Firestore if active
      if (isFirebaseEnabled) {
        try {
          const overridesSync = Object.entries(imageOverrides).map(([orig, uplo]) => 
            saveLiveOverride(orig, String(uplo))
          );
          await Promise.all(overridesSync);
          await saveFullPortfolio(projects);
          firestoreSuccess = true;
        } catch (err) {
          console.error("Firestore global sync failed:", err);
        }
      }

      const overallSuccess = overridesSuccess && portfolioSuccess;
      if (overallSuccess) {
        console.log("Saving complete - changes synced successfully to custom node instance.");
      } else if (isFirebaseEnabled && firestoreSuccess) {
        console.log("Saving complete - changes synced successfully to Firestore database instance.");
      } else {
        // Both Express APIs + Firebase are unavailable. We are running on a static client host (e.g. Netlify).
        // Trigger the gorgeous Static Save status modal. This notifies them of successful browser cache persistence
        // and unlocks a clean one-click JSON download file utility.
        setShowStaticSaveModal(true);
      }
    } catch (err: any) {
      console.error("Failed to perform complete solidification save:", err);
      alert("保存失败: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAuthenticate = () => {
    if (authPassword === "Wuzhenxin123") {
      setIsAdmin(true);
      setShowAuthModal(false);
      setAuthPassword("");
      setAuthError("");
    } else {
      setAuthError("密码错误，请重新输入");
    }
  };

  // Main Categories Custom Editor
  const handleAddCategory = () => {
    const title = window.prompt("请输入新作品集大类的中文分类名称（例如：画册设计 / UI设计）：");
    if (!title) return;
    
    // Auto-generate some credentials
    const tagVal = window.prompt("为该大类添加一个首选子分类标签（例如：企业画册）：") || "设计";
    const partNum = String(projects.length + 1).padStart(2, "0");
    const newId = `custom_${Date.now()}`;
    const newCategory = {
      id: newId,
      part: partNum,
      title: title,
      category: title.toUpperCase(),
      time: "2020 - 2026",
      image: "/assets/images/uploaded_1779532286287______.png",
      description: `深耕${title}创意，融合先锋物理渲染与人文感知底色。`,
      tags: [tagVal],
      subProjects: [
        {
          title: `默认${title}作品`,
          tag: tagVal,
          description: `为【${title}】分类新建的初始子项目。您可以通过编辑更改此文字。`,
          images: ["/assets/images/uploaded_1779532286287______.png"]
        }
      ]
    };
    
    const updatedProjects = [...projects, newCategory];
    savePortfolio(updatedProjects);
  };

  const handleDeleteCategory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除整个【作品大分类】以及里面的所有子项目吗？此操作不可撤销。")) return;
    
    const updatedProjects = projects.filter(p => p.id !== id);
    const orderedProjects = updatedProjects.map((p, idx) => ({
      ...p,
      part: String(idx + 1).padStart(2, "0")
    }));
    
    savePortfolio(orderedProjects);
  };

  // Sub Project Add and Edit Mechanics
  const handleAddSubProject = () => {
    if (!selectedProject) return;
    setEditingSubProjectIdx(-1); // -1 marks we are making a new sub-project
    setEditingSubProject({
      title: "全新概念展示项目",
      tag: selectedProject.tags[0] || "其他",
      description: "在这里输入专业的项目介绍、调色以及物理几何工艺详情描述...",
      images: ["/assets/images/uploaded_1779532286287______.png"]
    });
  };

  const handleEditSubProject = (idx: number) => {
    if (!selectedProject) return;
    setEditingSubProjectIdx(idx);
    const target = selectedProject.subProjects[idx];
    setEditingSubProject({
      title: target.title,
      tag: target.tag,
      description: target.description,
      images: [...target.images]
    });
  };

  const handleDeleteSubProject = (idx: number) => {
    if (!selectedProject) return;
    if (!window.confirm("确定要删除这个项目吗？里面的图片和文字都将被移除。")) return;
    
    const updatedSubProjects = selectedProject.subProjects.filter((_, sIdx) => sIdx !== idx);
    const updatedProject = {
      ...selectedProject,
      subProjects: updatedSubProjects
    };
    
    const updatedProjects = projects.map(p => p.id === selectedProject.id ? updatedProject : p);
    setSelectedProject(updatedProject);
    savePortfolio(updatedProjects);
  };

  const handleSaveSubProjectDetails = () => {
    if (!selectedProject || !editingSubProject) return;
    
    let updatedSubProjects = [...selectedProject.subProjects];
    if (editingSubProjectIdx === -1) {
      updatedSubProjects.push(editingSubProject);
    } else if (editingSubProjectIdx !== null) {
      updatedSubProjects[editingSubProjectIdx] = editingSubProject;
    }
    
    // Auto sync selected project's categories
    const updatedTags = [...selectedProject.tags];
    if (editingSubProject.tag && !updatedTags.includes(editingSubProject.tag)) {
      updatedTags.push(editingSubProject.tag);
    }
    
    const updatedProject = {
      ...selectedProject,
      tags: updatedTags,
      subProjects: updatedSubProjects
    };
    
    const updatedProjects = projects.map(p => p.id === selectedProject.id ? updatedProject : p);
    setSelectedProject(updatedProject);
    savePortfolio(updatedProjects);
    
    setEditingSubProjectIdx(null);
    setEditingSubProject(null);
  };

  // Direct Thumbnail ROW Interactions in Sub Project View
  const handleDeleteImageFromActiveSubProj = (imageIdx: number) => {
    if (!selectedProject || selectedGalleryItemIndex === null) return;
    
    const activeSubProj = selectedProject.subProjects[selectedGalleryItemIndex];
    if (activeSubProj.images.length <= 1) {
      alert("每个项目必须保留至少 1 张图片，以展示完美视觉！");
      return;
    }
    
    const updatedSubProjects = selectedProject.subProjects.map((sub, sIdx) => {
      if (sIdx === selectedGalleryItemIndex) {
        return {
          ...sub,
          images: sub.images.filter((_, imgI) => imgI !== imageIdx)
        };
      }
      return sub;
    });
    
    const updatedProject = {
      ...selectedProject,
      subProjects: updatedSubProjects
    };
    
    const updatedProjects = projects.map(p => p.id === selectedProject.id ? updatedProject : p);
    
    if (activeImageIndex >= updatedSubProjects[selectedGalleryItemIndex].images.length) {
      setActiveImageIndex(Math.max(0, updatedSubProjects[selectedGalleryItemIndex].images.length - 1));
    }
    
    setSelectedProject(updatedProject);
    savePortfolio(updatedProjects);
  };

  const handleSubProjectImgMetaFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject || selectedGalleryItemIndex === null) return;
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Content = reader.result as string;
        const compressedBase64 = await compressImage(base64Content);
        
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: file.name,
            fileContent: compressedBase64,
            originalUrl: `/assets/images/dynamic_${Date.now()}_${file.name}`
          })
        });
        
        if (response.ok) {
          const resJson = await response.json();
          const targetUrl = resJson.relativeUrl || compressedBase64;
          
          const updatedSubProjects = selectedProject.subProjects.map((sub, sIdx) => {
            if (sIdx === selectedGalleryItemIndex) {
              return {
                ...sub,
                images: [...sub.images, targetUrl]
              };
            }
            return sub;
          });
          
          const updatedProject = {
            ...selectedProject,
            subProjects: updatedSubProjects
          };
          
          const updatedProjects = projects.map(p => p.id === selectedProject.id ? updatedProject : p);
          setSelectedProject(updatedProject);
          savePortfolio(updatedProjects);
          
          setActiveImageIndex(updatedProject.subProjects[selectedGalleryItemIndex].images.length - 1);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert("添加图片失败，请重试");
    } finally {
      e.target.value = "";
    }
  };

  const [activeNav, setActiveNav] = useState("关于我");
  const [showQRCode, setShowQRCode] = useState(false);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [selectedGalleryItemIndex, setSelectedGalleryItemIndex] = useState<number | null>(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("ALL");
  const [activeNote, setActiveNote] = useState<1 | 2>(2);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [showSlowLoader, setShowSlowLoader] = useState(false);
  const loaderTimerRef = useRef<any>(null);

  // Derive current main image source path to track loading state
  const currentSubProject = selectedProject && selectedGalleryItemIndex !== null 
    ? selectedProject.subProjects[selectedGalleryItemIndex] 
    : null;
  const mainImageSrc = currentSubProject && currentSubProject.images[activeImageIndex] 
    ? currentSubProject.images[activeImageIndex] 
    : "";

  // Set loading to true whenever the image source changes with a smart delay
  useEffect(() => {
    if (mainImageSrc) {
      setIsImageLoading(true);
      setShowSlowLoader(false);

      if (loaderTimerRef.current) {
        clearTimeout(loaderTimerRef.current);
      }

      loaderTimerRef.current = setTimeout(() => {
        setShowSlowLoader(true);
      }, 150);

      const img = new Image();
      img.onload = () => {
        setIsImageLoading(false);
        setShowSlowLoader(false);
        if (loaderTimerRef.current) {
          clearTimeout(loaderTimerRef.current);
          loaderTimerRef.current = null;
        }
      };

      img.onerror = () => {
        setIsImageLoading(false);
        setShowSlowLoader(false);
        if (loaderTimerRef.current) {
          clearTimeout(loaderTimerRef.current);
          loaderTimerRef.current = null;
        }
      };

      img.src = mainImageSrc;

      // If already complete or cached, bypass loading state immediately
      if (img.complete) {
        setIsImageLoading(false);
        setShowSlowLoader(false);
        if (loaderTimerRef.current) {
          clearTimeout(loaderTimerRef.current);
          loaderTimerRef.current = null;
        }
      }

      return () => {
        if (loaderTimerRef.current) {
          clearTimeout(loaderTimerRef.current);
          loaderTimerRef.current = null;
        }
        img.onload = null;
        img.onerror = null;
      };
    } else {
      setIsImageLoading(false);
      setShowSlowLoader(false);
      if (loaderTimerRef.current) {
        clearTimeout(loaderTimerRef.current);
        loaderTimerRef.current = null;
      }
    }
  }, [mainImageSrc]);

  // Pre-load all sub-project images as soon as a project is selected
  useEffect(() => {
    if (selectedProject) {
      selectedProject.subProjects.forEach((sub) => {
        sub.images.forEach((url) => {
          const img = new Image();
          img.src = url;
        });
      });
    }
  }, [selectedProject]);

  // Clear sub-stages when modal is closed
  useEffect(() => {
    if (!selectedProject) {
      setSelectedGalleryItemIndex(null);
      setSelectedTagFilter("ALL");
      setActiveImageIndex(0);
    }
  }, [selectedProject]);

  // Reset active sub-image index when selected sub-project changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedGalleryItemIndex]);

  // Lock body scroll when project modal or QR code is open to prevent dual scrolling performance hit
  useEffect(() => {
    if (selectedProject || showQRCode) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedProject, showQRCode]);

  // Scroll to section handler
  const scrollToSection = (id: string, label: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80; // Offset for fixed navbar
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
      setActiveNav(label);
    }
  };

  // Scroll to top handler
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActiveNav("关于我");
  };

  return (
    <div className="min-h-screen font-sans selection:bg-neon-green selection:text-black">
      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-[999] flex justify-center py-6 transition-all duration-300 ${selectedProject ? "opacity-0 pointer-events-none invisible" : ""}`}>
        <div className="bg-black/60 backdrop-blur-xl rounded-full px-10 py-1 flex items-center gap-10 shadow-lg mt-[13px]">
          <button 
            onClick={scrollToTop}
            className="flex items-center gap-4 cursor-pointer group transition-all"
          >
            <div className="w-8 h-8 bg-neon-green rounded-full flex items-center justify-center -ml-3 group-hover:scale-110 transition-transform">
              <span className="font-serif font-black text-xs text-black italic">WZ</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-black text-sm italic tracking-widest text-white">武桢昕</span>
              <span className="text-[10px] font-['Georgia'] italic tracking-widest text-neon-green/60 uppercase border-l-2 border-white/20 pl-4 py-1 leading-none">Visual Design</span>
            </div>
          </button>
          
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: "关于我", id: "about-me" },
              { label: "作品集", id: "portfolio" },
              { label: "工作经历", id: "experience" }
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => scrollToSection(item.id, item.label)}
                className={`px-5 py-2 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                  activeNav === item.label 
                  ? "bg-neon-green text-black shadow-[0_0_15px_rgba(163,255,18,0.3)]" 
                  : "text-white/40 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          
          <button 
            onClick={() => scrollToSection("contact", "和我谈谈")}
            className="group bg-white/5 hover:bg-neon-green text-white hover:text-black py-2.5 px-7 rounded-full text-xs font-bold uppercase tracking-widest border border-white/10 hover:border-transparent transition-all ml-2 flex items-center gap-2"
          >
            <div className="relative flex h-2 w-2">
              <motion.span 
                animate={selectedProject ? {} : { 
                  scale: [1, 2, 1], 
                  opacity: [0.5, 0, 0.5] 
                }}
                transition={selectedProject ? {} : { 
                  duration: 2.5, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="absolute inline-flex h-full w-full rounded-full bg-neon-green"
              ></motion.span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon-green group-hover:bg-black transition-colors"></span>
            </div>
            和我谈谈
          </button>
        </div>
      </nav>

      <main className={selectedProject ? "invisible pointer-events-none" : "relative"}>
        {/* Hero Section Container for positioning indicator outside clipped area */}
        <div className="relative max-w-[1400px] mx-auto mt-12 md:mt-16">
          <section 
            className="bg-white rounded-b-[60px] pb-12 pt-24 md:pt-28 lg:pt-24 px-6 md:px-8 lg:px-16 xl:px-24 relative z-20 w-full shadow-sm overflow-hidden"
            style={{ 
              clipPath: 'url(#hero-clip-path)',
              // Removing standard rounded-t as it will be handled by clip-path for consistency
            }}
          >
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-10 xl:gap-16 relative z-10">
            <motion.div 
               initial={{ opacity: 0, x: -50 }}
               animate={{ opacity: 1, x: 0 }}
               transition={{ duration: 0.8 }}
               className="flex-1 flex flex-col justify-center items-start space-y-6 lg:space-y-8 pl-2 md:pl-4 py-4 lg:py-10"
            >
              {/* Top Greeting line */}
              <div className="flex items-center mb-1">
                <span 
                  className="text-[11px] md:text-[13px] lg:text-[13px] font-sans font-semibold text-neutral-400 tracking-[0.3em] uppercase inline-block -mt-4 lg:-mt-[40px]"
                >
                  HELLO, I'M WUZHENXIN
                </span>
              </div>

              {/* Huge typographic feature */}
              <div className="flex flex-col select-none leading-none">
                <h1 className="text-[44px] sm:text-[64px] md:text-[80px] lg:text-[88px] xl:text-[112px] font-serif italic font-extrabold text-black tracking-tighter leading-[0.9]">
                  Design
                </h1>
                <h1 className="text-[52px] sm:text-[74px] md:text-[92px] lg:text-[100px] xl:text-[136px] font-sans font-black italic uppercase text-neon-green tracking-tight leading-[0.8] -mt-2 lg:-mt-3">
                  PORTFOLIO
                </h1>
              </div>

              {/* Bottom taglines with vertical lime accent */}
              <div 
                className="flex items-center gap-4.5 py-1 border-l-[3px] border-neon-green pl-4 self-stretch md:self-auto mt-4 lg:mt-[28px]"
              >
                <p className="text-neutral-800 font-sans text-xs sm:text-sm md:text-lg lg:text-lg font-medium tracking-wide">
                  视觉设计师 / 热爱创造 / 关注细节 / 解决问题
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: 5 }}
              animate={{ opacity: 1, scale: 1, rotate: -2 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="relative px-4 lg:pr-8 xl:pr-16 lg:mr-4 xl:mr-8"
            >
              {/* Polaroid Frame - Changed to premium white styling with realistic drop shadows */}
              <div 
                className="relative z-10 w-64 md:w-80 lg:w-72 xl:w-80 p-4 lg:p-5 pb-10 lg:pb-16 bg-white border border-neutral-200/50 rounded-xs shadow-[0_24px_50px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.04)] transform hover:rotate-1 hover:scale-[1.02] transition-all duration-300 ml-3 lg:ml-[18px]"
              >
                <div className="aspect-[3/4] bg-neutral-50 overflow-hidden relative group border border-neutral-200/40">
                  <img 
                    src={getOverriddenImg("/assets/images/hero_portrait_________1.png")} 
                    alt="Portrait"
                    className="w-full h-full object-cover grayscale transition-all duration-700 hover:grayscale-0 group-hover:grayscale-0 hover:scale-105 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                  {isAdmin && (
                    <ImageUploadOverlay 
                      originalUrl="/assets/images/hero_portrait_________1.png"
                      onUploaded={(url) => handleImageUploaded("/assets/images/hero_portrait_________1.png", url)}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/[0.02] pointer-events-none" />
                </div>
                <div className="mt-6 text-center">
                  <p className="text-neutral-800 font-serif italic text-base tracking-widest font-extrabold">武桢昕 Born in 2002</p>
                </div>
              </div>
              
              {/* Sticky Note & Pushpin Container */}
              <div className="absolute -top-10 -left-16 z-20 select-none mt-[4px]">
                <motion.div 
                  initial={{ rotate: -15 }}
                  animate={selectedProject ? {} : { rotate: [-15, -12, -15] }}
                  transition={selectedProject ? {} : { duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  className="relative group cursor-grab active:cursor-grabbing"
                >
                  {/* Sticky Note (Sticky/Adhesive note look) */}
                  <div 
                    className="bg-neon-green px-4 pb-4 shadow-[10px_10px_20px_rgba(0,0,0,0.2)] transform rotate-[-15deg] border-l border-t border-black/5 min-w-[100px] flex items-center justify-center relative z-30"
                    style={{
                      marginLeft: "51px",
                      paddingTop: "14px",
                      marginTop: "40px"
                    }}
                  >
                    {/* Pushpin (图钉) - Tactile 3D styling with black glossy cap and metallic shaft */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center">
                      {/* Glossy Plastic Head */}
                      <div className="relative w-6 h-6 rounded-full bg-gradient-to-br from-zinc-500 via-zinc-800 to-black shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),0_2px_4px_rgba(0,0,0,0.5)] border border-black/40 flex items-center justify-center">
                        {/* Highlights */}
                        <div className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-white/70 filter blur-[0.2px]" />
                        <div className="absolute bottom-1 right-1 w-2 h-1 rounded-full bg-black/60" />
                        {/* Upper rim cap to look like classical pin */}
                        <div className="w-3.5 h-1 bg-zinc-400/80 rounded-[1px] absolute top-[2px] shadow-sm" />
                      </div>
                      {/* Steel pin shaft */}
                      <div className="w-[2px] h-3 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-400 mr-[1px] shadow-[1px_1px_2px_rgba(0,0,0,0.4)]" />
                      {/* Base shadow of pin point */}
                      <div className="w-1.5 h-0.5 bg-black/50 rounded-full blur-[0.5px] -mt-[1px] -mr-[1px]" />
                    </div>

                    <span 
                      className="font-serif font-black italic text-black text-lg block leading-none py-2 px-1 whitespace-nowrap"
                    >
                      (个人简介)
                    </span>
                    {/* Adhesive shadow effect */}
                    <div className="absolute top-0 right-0 w-3 h-3 bg-black/5" />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>
          
          {/* Background Grid Accent */}
          <motion.div 
            className="absolute inset-0 opacity-[0.08] pointer-events-none rounded-t-[44px] rounded-b-[60px] overflow-hidden z-0" 
            style={{ 
              backgroundImage: `
                linear-gradient(to right, #000 1px, transparent 1px),
                linear-gradient(to bottom, #000 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px' 
            }}
            animate={selectedProject ? {} : { 
              backgroundPosition: ["0px 0px", "40px 40px"] 
            }}
            transition={selectedProject ? {} : { 
              duration: 8, 
              repeat: Infinity, 
              ease: "linear" 
            }}
          />
        </section>

        {/* Centered Scroll Indicator - Placed outside of clipped section */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-[110]">
           <motion.div 
            animate={selectedProject ? {} : { y: [0, 5, 0] }}
            transition={selectedProject ? {} : { repeat: Infinity, duration: 2, ease: "easeInOut" }}
             className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-2xl cursor-pointer hover:bg-black/60 transition-all group/scroll"
             onClick={() => scrollToSection("about-me", "关于我")}
          >
            <div className="w-12 h-12 bg-neon-green rounded-full flex items-center justify-center shadow-lg group-hover/scroll:scale-110 transition-transform">
              <ChevronDown className="w-6 h-6 text-black" />
            </div>
            
            {/* Decorative curved lines like in the screenshot */}
            <div className="absolute inset-0 rounded-full border-t border-white/20 rotate-[30deg] scale-110" />
            <div className="absolute inset-0 rounded-full border-b border-white/20 -rotate-[30deg] scale-110" />
          </motion.div>
        </div>
      </div>

        {/* Scrolling Marquee */}
        <div className="relative z-30 -mt-4 -mb-24 overflow-hidden py-12 pointer-events-none">
          <div className="bg-black py-6 -rotate-2 scale-105 shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative">
            <motion.div 
              className="flex whitespace-nowrap"
              animate={selectedProject ? {} : { x: ["0%", "-50%"] }}
              transition={selectedProject ? {} : { duration: 30, repeat: Infinity, ease: "linear" }}
            >
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-12 pr-12">
                  <span className="text-4xl md:text-5xl font-serif italic font-black text-neon-green tracking-tighter uppercase">
                    Visual Design
                  </span>
                  <span className="text-4xl md:text-5xl font-sans font-black text-white tracking-widest uppercase">
                    平面视觉
                  </span>
                  <span className="text-4xl md:text-5xl font-serif italic font-black text-neon-green tracking-tighter uppercase">
                    Motion Graphics
                  </span>
                  <span className="text-4xl md:text-5xl font-sans font-black text-white tracking-widest uppercase">
                    视频剪辑
                  </span>
                  <span className="text-4xl md:text-5xl font-serif italic font-black text-neon-green tracking-tighter uppercase">
                    3D Animation
                  </span>
                  <span className="text-4xl md:text-5xl font-sans font-black text-white tracking-widest uppercase">
                    三维动态
                  </span>
                  <span className="text-4xl md:text-5xl font-serif italic font-black text-neon-green tracking-tighter uppercase">
                    Creative Tech
                  </span>
                  <span className="text-4xl md:text-5xl font-sans font-black text-white tracking-widest uppercase">
                    创意科技
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* About Me Section */}
        <motion.section 
          id="about-me" 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="bg-black py-24 px-6 md:px-12 scroll-mt-20 max-w-[1400px] mx-auto rounded-[60px] mt-12 shadow-xl relative z-20 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row gap-24 items-stretch">
              <div className="lg:w-1/2 flex flex-col justify-between py-2">
                <motion.div 
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, duration: 0.8 }}
                  className="space-y-12"
                >
                  <div className="flex items-baseline gap-4">
                    <h2 className="text-7xl font-serif italic text-white font-black tracking-tighter">About Me.</h2>
                    <span className="bg-neon-green text-black font-bold text-xs uppercase tracking-widest px-4 py-1.5 rounded-full">关于我</span>
                  </div>
                  
                  <div className="space-y-8">
                    <p className="text-white text-2xl font-medium leading-tight max-w-xl">
                      精通平面、视频与三维动画，善用AI强化视觉表现力，始终以创意与审美为核心。
                    </p>
                    
                    <p className="text-white/50 leading-relaxed font-light max-w-xl text-[17px]">
                      长期汲取国内外优秀设计灵感，打磨自身审美与设计逻辑。日本设计大师原研哉提出的「设计是清晰易懂的本质」，是我一直恪守的设计理念。我擅长在繁杂信息中梳理秩序，以简洁直观的表达，传递事物最核心的本质。
                    </p>
                  </div>
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                  className="mt-16"
                >
                  <div 
                    className="inline-block p-8 bg-neon-green text-black italic font-black text-[17px] max-w-xl shadow-[5px_5px_0px_#000,10px_10px_20px_rgba(0,0,0,0.5)] transform -rotate-1 hover:rotate-0 hover:scale-[1.02] transition-all duration-300 relative overflow-hidden"
                    style={{
                      borderRadius: "12px 95px 16px 85px / 85px 12px 95px 16px",
                      border: "1px solid rgba(0,0,0,0.15)"
                    }}
                  >
                    {/* Subtle corner fold shadow */}
                    <div className="absolute top-0 right-0 w-8 h-8 bg-black/10 pointer-events-none" style={{ borderRadius: "0 0 0 35px" }} />
                    <span className="relative z-10 leading-relaxed block text-neutral-950 font-extrabold">
                      “能把抽象的任务，转化为清晰具象的落地成果” — 前辈曾如此评价。
                    </span>
                  </div>
                </motion.div>
              </div>

                <div className="lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: GraduationCap, label: "毕业院校", sub: "大连交通大学艺术设计学院 · 动画专业", shape: "rounded-tl-[40px] rounded-br-[40px] rounded-tr-[16px] rounded-bl-[16px]", index: "01" },
                  { icon: MapPin, label: "居住地", sub: "现常住辽宁大连，可根据职业需求灵活调整居住城市", shape: "rounded-tr-[40px] rounded-bl-[40px] rounded-tl-[16px] rounded-br-[16px]", index: "02" },
                  { icon: Fingerprint, label: "MBTI: INTJ", sub: "建筑师型人格 - 拥有战略性思维，凡事皆有计划", shape: "rounded-tl-[16px] rounded-tr-[36px] rounded-br-[16px] rounded-bl-[36px]", index: "03" },
                  { icon: Smile, label: "性格", sub: "做事严谨、具有强烈的责任感，且富有审美情趣与生活热忱", shape: "rounded-tl-[36px] rounded-tr-[16px] rounded-br-[36px] rounded-bl-[16px]", index: "04" }
                ].map((item, idx) => (
                  <motion.div 
                    key={idx} 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    whileInView={{ opacity: 1, scale: 1, y: 0 }}
                    viewport={{ once: true }}
                    whileHover={{ scale: 1.05, y: -5 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 17,
                      // Combine entrance and hover transition needs
                      delay: 0.3 + (idx * 0.1),
                    }}
                    className={`p-10 ${item.shape} bg-[#0b0b0b] border-2 border-neon-green/30 hover:border-neon-green space-y-4 flex flex-col justify-center items-center text-center relative overflow-hidden cursor-default transition-all duration-300 ease-out group shadow-[0_15px_45px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_60px_rgba(163,255,18,0.15)]`}
                  >
                    {/* Animated Scanning Line */}
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-b from-transparent via-neon-green/15 to-transparent h-24 w-full z-0 opacity-0 group-hover:opacity-100 pointer-events-none"
                      animate={selectedProject ? {} : { top: ["-25%", "125%"] }}
                      transition={selectedProject ? {} : { duration: 2, repeat: Infinity, ease: "linear" }}
                    />

                    {/* Industrial Texture Overlay with Gradient Mask */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-[0.06] transition-all duration-300 pointer-events-none" 
                      style={{ 
                        backgroundImage: "url('https://www.transparenttextures.com/patterns/carbon-fibre.png')",
                        maskImage: "radial-gradient(circle at center, black, transparent 80%)",
                        WebkitMaskImage: "radial-gradient(circle at center, black, transparent 80%)",
                        mixBlendMode: 'overlay'
                      } as any} 
                    />
                    
                    {/* Index Number */}
                    <span className="absolute top-6 left-8 font-mono text-[10px] font-black text-neon-green/30 group-hover:text-neon-green/60 transition-all duration-300 transform group-hover:translate-x-1">
                      INFO // {item.index}
                    </span>

                    <div className="w-16 h-16 rounded-2xl bg-[#141414] border border-neon-green/20 group-hover:border-neon-green/50 flex items-center justify-center group-hover:rotate-[12deg] group-hover:scale-110 transition-all duration-300 ease-out relative z-10 shadow-lg group-hover:shadow-neon-green/20">
                      <item.icon className="w-8 h-8 text-neon-green" />
                      {/* Sub-glow */}
                      <div className="absolute inset-0 bg-neon-green/25 rounded-2xl blur-xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    </div>

                    <div className="relative z-10 space-y-2 transform transition-transform duration-300 group-hover:translate-y-1">
                      <h4 className="font-black text-white group-hover:text-neon-green transition-colors duration-300 text-xl tracking-tighter italic uppercase drop-shadow-sm">{item.label}</h4>
                      <p className="text-neutral-400 group-hover:text-neutral-200 transition-colors duration-300 text-[13px] leading-relaxed font-semibold px-1 max-w-[200px]">{item.sub}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Contents Grid Section */}
        <motion.section 
          id="portfolio" 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="bg-neon-green py-10 px-6 md:px-12 rounded-[60px] max-w-[1400px] mx-auto mt-4 z-20 relative scroll-mt-20 shadow-lg"
        >
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 pointer-events-none opacity-5 rounded-[60px] overflow-hidden">
            <motion.div 
              className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 24px)'
              }}
              animate={selectedProject ? {} : { 
                x: [0, 24],
                y: [0, -24]
              }}
              transition={selectedProject ? {} : { 
                duration: 2, 
                repeat: Infinity, 
                ease: "linear" 
              }}
            />
          </div>
          {/* Binder Clip Decorative Element */}
          <div className="absolute -top-14 right-20 z-[70] rotate-[-8deg] pointer-events-none filter drop-shadow-2xl hidden md:block select-none scale-110">
            <svg width="90" height="110" viewBox="0 0 90 110" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Wire Handle (Back) */}
              <path 
                d="M38 75 L43 55 C35 45, 30 15, 45 15 C60 15, 55 45, 47 55 L52 75" 
                stroke="#E0E7FF" 
                strokeWidth="5" 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
              {/* Binder Clip Body - Black */}
              <rect x="15" y="65" width="60" height="35" rx="4" fill="#111111" />
              {/* Wire Handle (Front) */}
              <path 
                d="M38 85 L43 55 C35 45, 30 15, 45 15 C60 15, 55 45, 47 55 L52 85" 
                stroke="white" 
                strokeWidth="5" 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
              {/* Accent line where handle meets body */}
              <path d="M20 90 H70" stroke="#333333" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
            </svg>
          </div>

          <div className="max-w-7xl mx-auto space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 border-b-2 border-black/5 pb-4">
              <div className="flex items-baseline gap-4">
                <h2 className="text-6xl font-serif italic text-black font-black tracking-tighter">Contents.</h2>
                <span className="bg-black text-neon-green font-bold text-xs uppercase tracking-wider px-3 py-1 rounded-full">作品集</span>
              </div>
              {isAdmin && (
                <button
                  onClick={handleAddCategory}
                  className="px-5 py-2.5 bg-black text-[#D9FF33] hover:text-black hover:bg-[#D9FF33] font-sans font-black text-xs uppercase tracking-widest border border-black rounded-full flex items-center gap-1.5 transition-all duration-200 shadow-[3px_3px_0px_#000] cursor-pointer"
                >
                  ➕ 新增分类 (Add Category)
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-8 lg:gap-12 pb-8 max-w-6xl mx-auto">
              {projects.map((item, idx) => (
                <motion.div 
                  key={item.id || idx}
                  initial="initial"
                  whileInView="animate"
                  whileHover="hover"
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  variants={{
                    initial: { opacity: 0, y: 30 },
                    animate: { opacity: 1, y: 0 },
                    hover: { y: -10 }
                  }}
                  onClick={() => setSelectedProject(item)}
                  className="bg-[#f2efe7] rounded-tl-[80px] rounded-br-[80px] rounded-tr-[20px] rounded-bl-[20px] p-10 min-h-[380px] shadow-xl group cursor-pointer relative overflow-hidden"
                  style={{ 
                    backgroundImage: 'linear-gradient(#00000008 1px, transparent 1px), linear-gradient(90deg, #00000008 1px, transparent 1px)', 
                    backgroundSize: '20px 20px' 
                  }}
                >
                  {/* Delete category button for Admin */}
                  {isAdmin && (
                    <button
                      onClick={(e) => handleDeleteCategory(item.id, e)}
                      className="absolute top-6 left-6 z-50 w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg border border-red-500/10 cursor-pointer hover:scale-110 active:scale-90 transition-all"
                      title="删除此分类"
                    >
                      🗑️
                    </button>
                  )}
                  {/* Pin element */}
                  <div className="absolute top-8 right-12 z-30 pointer-events-none">
                    <motion.div
                      variants={{
                        initial: { rotate: 45 },
                        hover: { rotate: 30 }
                      }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 300, 
                        damping: 15 
                      }}
                    >
                      <Pin className="w-8 h-8 text-[#a0a0a0] fill-[#a0a0a0]" />
                    </motion.div>
                  </div>

                  <div className="flex flex-col h-full justify-between items-start relative z-10">
                    <div className="w-full space-y-8">
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[10px] font-bold text-black/40 font-mono tracking-widest uppercase">TIME: {item.time}</span>
                        <div className="bg-black/80 px-20 h-[100px] absolute -right-16 -top-16 rotate-12 -z-10 group-hover:bg-black transition-colors" />
                      </div>
                      
                      <div className="flex gap-12 pt-4">
                        <span className="text-[12px] font-bold text-black tracking-widest uppercase">{item.category}</span>
                        <span className="text-[12px] font-serif font-black italic text-black/40 uppercase leading-none">(DESIGN)</span>
                      </div>
                    </div>

                    <div className="space-y-4 pt-12">
                      <p className="text-3xl font-serif font-black italic text-black leading-none tracking-tighter">PART {item.part}</p>
                      <h3 className="text-[50px] font-bold text-black font-sans tracking-tight">{item.title}</h3>
                    </div>

                    <div className="w-full pt-8 flex justify-end">
                       <button className="flex items-center gap-2 text-xs font-bold text-black/60 hover:text-black transition-colors">
                        <span>查看项目</span> <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Floating Image element */}
                  <motion.div 
                    variants={{
                      initial: { rotate: 10, x: 20 },
                      animate: { rotate: 12, x: 0 },
                      hover: { rotate: 5, scale: 1.1, x: -10, y: -10 }
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="absolute top-1/2 -translate-y-1/2 right-4 w-48 h-56 bg-white rounded-3xl p-1.5 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.30),0_0_40px_rgba(0,0,0,0.05)] border border-neutral-100/50 hover:border-black/10 z-20 overflow-hidden group transition-all duration-300"
                  >
                    <img 
                      src={getOverriddenImg(item.image)} 
                      alt={item.title}
                      className="w-full h-full object-cover rounded-[18px] grayscale transition-all duration-500 group-hover:grayscale-0 group-hover:scale-105"
                    />
                    {isAdmin && (
                      <ImageUploadOverlay 
                        originalUrl={item.image}
                        onUploaded={(url) => handleImageUploaded(item.image, url)}
                      />
                    )}
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Experience Section */}
        <motion.section 
          id="experience" 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="bg-black py-24 px-6 md:px-12 scroll-mt-20 max-w-[1400px] mx-auto rounded-[60px] mt-4 shadow-xl relative z-20 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto space-y-16">
            <div className="flex flex-col md:flex-row gap-24">
              <div className="md:w-1/2 space-y-12">
                <div className="flex items-baseline gap-4">
                  <h2 className="text-6xl font-serif italic text-white font-black tracking-tighter">Experience.</h2>
                  <span className="bg-neon-green text-black font-bold text-xs uppercase tracking-wider px-3 py-1 rounded-full">工作经历</span>
                </div>

                <div className="space-y-8">
                  {[
                    { date: "2023.4 - 2024.5", company: "拾梦猫（重庆）动画设计有限公司 · 三维动画师", desc: "熟练制作角色动作与口型动画。深度参与【王者荣耀-铠篇】等相关动画项目。" },
                    { date: "2024.06 - 2026.06", company: "大连和信涂料有限公司 · 广报营销课员工", desc: "负责视频剪辑、各项平面物料（宣传册、文化墙、展会展板官网网页，电商页面）及三维建模，运营公司短视频与小红书，兼顾日常杂务与项目对接落地，积累了扎实的综合实操经验。" },
                    { date: "2026.8", company: "自由设计师 / 个人工作室", desc: "独立承接品牌设计、包装设计及视觉顾问项目，服务多位客户。" },
                  ].map((exp, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.2 }}
                      className="flex gap-8 relative pb-8 group"
                    >
                      {/* Timeline Line */}
                      {idx !== 2 && <div className="absolute left-[7px] top-6 bottom-0 w-[1px] bg-white/25" />}
                      
                      <div className="mt-1.5 flex-none">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-neon-green bg-black group-hover:bg-neon-green transition-colors" />
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-mono font-bold text-white/40">{exp.date}</span>
                        <h4 className="font-bold text-lg">{exp.company}</h4>
                        <p className="text-sm text-white/40 leading-relaxed font-light">
                          {exp.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="md:w-1/2">
                <motion.div 
                   initial={{ opacity: 0, scale: 0.9 }}
                   whileInView={{ opacity: 1, scale: 1 }}
                   className="bg-neutral-900 rounded-[40px] overflow-hidden relative group h-auto shadow-[0_20px_80px_rgba(0,0,0,0.6)] flex flex-col mx-auto max-w-lg"
                >
                  {/* Background Image / Illustration */}
                  <div className="absolute inset-0 z-0">
                    <img 
                      src={getOverriddenImg("/assets/images/regenerated_image_1779446667775.png")} 
                      alt="Work Background"
                      className="w-full h-full object-cover grayscale brightness-[25%]"
                      referrerPolicy="no-referrer"
                    />
                    {isAdmin && (
                      <ImageUploadOverlay 
                        originalUrl="/assets/images/regenerated_image_1779446667775.png"
                        onUploaded={(url) => handleImageUploaded("/assets/images/regenerated_image_1779446667775.png", url)}
                      />
                    )}
                  </div>

                  <div className="relative p-8 h-full flex flex-col z-10">
                    {/* Header with Sparkle */}
                    <div className="flex flex-col space-y-2 mb-6">
                      <div className="flex items-center gap-3">
                        <motion.div
                          animate={selectedProject ? {} : { 
                            rotate: [0, 90, 180, 270, 360]
                          }}
                          transition={selectedProject ? {} : { duration: 15, repeat: Infinity, ease: "linear" }}
                        >
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-neon-green/80">
                            <path d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5L12 0Z" fill="currentColor" />
                          </svg>
                        </motion.div>
                        <h3 className="text-3xl font-serif italic text-white font-black leading-tight tracking-tight">Work Insights.</h3>
                      </div>
                      <span className="text-neon-green/80 font-mono font-black text-lg uppercase tracking-[0.3em] pl-11 ml-2">工作心得</span>
                    </div>

                    <div className="flex-1 relative mt-2 min-h-[345px]">
                      {/* Note 1: Deep Neutral Note (Top) - Replaced jumpy red */}
                      <motion.div 
                        initial={{ rotate: -4, x: -8, y: 80 }}
                        animate={{ 
                          rotate: activeNote === 1 ? -4 : -6,
                          x: activeNote === 1 ? -8 : -14,
                          y: activeNote === 1 ? 70 : 60,
                          zIndex: activeNote === 1 ? 20 : 10,
                          scale: activeNote === 1 ? 1 : 0.95
                        }}
                        whileHover={{ rotate: -2, y: 75, scale: 1.02, zIndex: 30 }}
                        onClick={() => setActiveNote(1)}
                        className="absolute top-0 left-0 right-6 bg-zinc-900 p-7 shadow-[10px_20px_40px_rgba(0,0,0,0.5)] origin-top-left border border-white/5 cursor-pointer transition-all duration-300"
                        style={{
                          clipPath: 'polygon(1% 0%, 99% 1%, 100% 3%, 98% 97%, 95% 100%, 2% 98%, 0% 94%, 1% 4%)',
                        }}
                      >
                        {/* Tape top right */}
                        <div className="absolute -top-3 right-6 w-10 h-4 bg-neon-green/80 rotate-[12deg] shadow-sm z-20" />
                        
                        <div className="text-white/90 space-y-4 font-mono">
                          <div className="flex justify-between items-start">
                            <div className="text-[10px] font-black opacity-40 uppercase tracking-widest leading-none">CORE CONCEPT // 26</div>
                            <div className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/50">KEEP</div>
                          </div>
                          <p className="text-base font-bold leading-tight uppercase italic pr-6 group-hover:text-neon-green transition-colors duration-300">
                            “设计不仅是视觉，更是信息的传递与情感的连接。”
                          </p>
                          <div className="h-[1px] bg-white/10 w-full my-2" />
                          <div className="space-y-1 mt-4">
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-neon-green/40" />
                              <span className="text-[10px] font-bold text-white/60">由繁入简的业务逻辑梳理</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-1 h-1 rounded-full bg-neon-green/40" />
                              <span className="text-[10px] font-bold text-white/60">全链路品牌价值导向设计</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>

                      {/* Note 2: The Neon Green Note (Bottom) */}
                      <motion.div 
                        initial={{ rotate: 3, x: 8, y: 200 }}
                        animate={{ 
                          rotate: activeNote === 2 ? 3 : 5,
                          x: activeNote === 2 ? 8 : 12,
                          y: activeNote === 2 ? 190 : 200,
                          zIndex: activeNote === 2 ? 20 : 10,
                          scale: activeNote === 2 ? 1 : 0.95
                        }}
                        whileHover={{ rotate: 1, y: 195, scale: 1.02, zIndex: 30 }}
                        onClick={() => setActiveNote(2)}
                        className="absolute top-0 right-0 left-8 bg-neon-green p-6 shadow-[20px_40px_60px_rgba(0,0,0,0.5)] origin-bottom-right border border-black/5 cursor-pointer transition-all duration-300 -mt-[18px]"
                        style={{
                          clipPath: 'polygon(1% 2%, 99% 0%, 100% 97%, 95% 100%, 3% 99%, 0% 95%, 2% 4%)',
                        }}
                      >
                        {/* Tape bottom left */}
                        <div className="absolute -bottom-2 -left-2 w-12 h-4 bg-white/50 rotate-[-15deg] shadow-sm z-20" />
                        {/* Tape top center */}
                        <div className="absolute -top-2 left-1/4 w-9 h-5 bg-black/10 backdrop-blur-sm rotate-[4deg] shadow-sm z-20" />

                        <div className="text-black overflow-hidden">
                           <div className="flex justify-between items-center mb-3">
                              <div className="text-[8px] font-black uppercase tracking-widest bg-black/10 px-1.5 py-0.5">REFLECTION // DESIGNER</div>
                           </div>
                           <p className="text-[11px] font-bold leading-[1.6] text-black/90">
                            从三维动画到广报营销，我完成了从 “专注技术” 到 “懂商业、能落地” 的成长。现在能以成熟视角承接品牌与包装项目，找到属于自己的创作节奏。
                          </p>
                          <div className="flex justify-end mt-3">
                            <span className="font-serif italic font-black text-lg text-black/15">WZ.</span>
                          </div>
                        </div>
                      </motion.div>
                    </div>

                    {/* Bottom detail */}
                    <div className="mt-auto pt-6 flex justify-between items-end">
                      <div className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em]">Insights Summary // V2</div>
                      <div className="flex gap-1.5">
                        <div 
                          onClick={() => setActiveNote(1)}
                          className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-all duration-300 ${activeNote === 1 ? 'bg-neon-green scale-125 shadow-[0_0_8px_rgba(163,255,18,0.6)]' : 'bg-neon-green/20'}`} 
                        />
                        <div 
                          onClick={() => setActiveNote(2)}
                          className={`w-1.5 h-1.5 rounded-full cursor-pointer transition-all duration-300 ${activeNote === 2 ? 'bg-neon-green scale-125 shadow-[0_0_8px_rgba(163,255,18,0.6)]' : 'bg-neon-green/20'}`} 
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Footer Section */}
        <motion.footer 
          id="contact" 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="bg-black py-16 px-6 md:px-12 border-t-2 border-white/10 scroll-mt-20 max-w-[1400px] mx-auto rounded-[60px] mt-4 mb-4 shadow-xl relative z-20 overflow-hidden"
        >
          <div className="max-w-7xl mx-auto flex flex-col gap-12">
            <div className="flex flex-col md:flex-row justify-between items-center gap-12">
              <h2 className="text-5xl font-serif italic font-black text-white italic tracking-tighter">Let's work together!</h2>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowQRCode(true)}
                  className="bg-white/5 border border-white/20 px-8 py-3 rounded-full flex items-center gap-3 hover:bg-neon-green hover:text-black hover:border-neon-green transition-all group cursor-pointer"
                >
                  <span className="font-bold">加我微信</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                
                <div className="flex items-center gap-1">
                   <div className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center">
                    <div className="w-12 h-12 bg-neon-green rounded-full flex items-center justify-center">
                      <svg 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        className="w-7 h-7 text-black"
                      >
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                        <circle cx="9" cy="11" r="0.5" fill="currentColor" />
                        <circle cx="15" cy="11" r="0.5" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-12 border-y border-white/10">
              <div className="flex items-center gap-3 text-white/40">
                <Mail className="w-5 h-5 text-neon-green" />
                <span className="text-sm font-mono">wuz826284@gmail.com</span>
              </div>
              <div className="flex items-center gap-3 text-white/40">
                <Phone className="w-5 h-5 text-neon-green" />
                <span className="text-sm font-mono">14741276556</span>
              </div>
              <div className="flex items-center gap-3 text-white/40">
                <MapPin className="w-5 h-5 text-neon-green" />
                <span className="text-sm font-mono">辽宁省 大连市</span>
              </div>
              <div className="flex justify-end order-first md:order-last">
                <button 
                  onClick={scrollToTop}
                  className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-white/20 uppercase tracking-widest font-bold">
              <p>Copyright ©武桢昕 All Rights Reserved.</p>
              <div className="flex gap-6">
                <span>Privacy</span>
                <span>Terms</span>
                <span>Cookies</span>
              </div>
            </div>
          </div>
        </motion.footer>
      </main>

      <AnimatePresence>
        {selectedProject && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", damping: 30, stiffness: 220 }}
            className="fixed inset-0 z-[2000] bg-white overflow-y-auto"
          >
            <div className="min-h-screen flex flex-col">
              {/* Header */}
              <header className="sticky top-0 z-[2100] px-6 py-6 md:px-12 flex justify-between items-center bg-white/80 backdrop-blur-md border-b border-black/5">
                <div className="flex items-center gap-4">
                  <span className="font-serif italic font-black text-2xl tracking-tighter text-black">PART {selectedProject.part}</span>
                  <div className="h-6 w-[1px] bg-black/10" />
                  <span className="text-sm font-bold tracking-widest text-black/40">{selectedProject.category}</span>
                </div>
                <button 
                  onClick={() => setSelectedProject(null)}
                  className="w-12 h-12 rounded-full border border-black/10 flex items-center justify-center bg-transparent text-black/40 hover:bg-black hover:text-white hover:scale-105 active:scale-95 transition-all duration-150 ease-out cursor-pointer origin-center group"
                >
                  <X className="w-5 h-5 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200 ease-out" />
                </button>
              </header>

              {/* Content */}
              <div className="max-w-7xl mx-auto px-6 py-16 md:px-12 w-full flex-grow">
                {selectedGalleryItemIndex === null ? (
                  // ================= SECOND LEVEL INTERFACE (Image 1 Model) =================
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="space-y-12"
                  >
                    {/* Header and Filter Info */}
                    <div className="border-b border-black/10 pb-8">
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                        <div>
                          <span className="text-xs font-mono uppercase tracking-widest text-black/40">Category Gallery / {selectedProject.category}</span>
                          <h2 className="text-4xl md:text-6xl font-sans font-black tracking-tighter mt-1 text-black">
                            {selectedProject.title}作品
                          </h2>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-mono text-black/40">
                          <span>共 {selectedProject.subProjects.length} 项创意设计发布</span>
                          {isAdmin && (
                            <button
                              onClick={handleAddSubProject}
                              className="px-4 py-2 bg-neutral-900 hover:bg-black text-[#D9FF33] font-bold text-xs uppercase tracking-wider rounded-xl border border-black/10 shadow-[2px_2px_0px_#000] hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                            >
                              <span>➕ 新增项目</span>
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {/* Horizontal filter tabs inspired by reference Image 1 */}
                      <div className="flex items-center gap-2 overflow-x-auto pt-6 scrollbar-none mt-6">
                        <button
                          onClick={() => setSelectedTagFilter("ALL")}
                          className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all rounded-full ${
                            selectedTagFilter === "ALL" 
                              ? "bg-black text-white font-bold" 
                              : "bg-black/5 text-black/60 hover:bg-black/10 font-medium"
                          }`}
                        >
                          全部 / ALL
                        </button>
                        {selectedProject.tags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setSelectedTagFilter(tag)}
                            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition-all rounded-full whitespace-nowrap ${
                              selectedTagFilter === tag 
                                ? "bg-black text-white font-bold" 
                                : "bg-black/5 text-black/60 hover:bg-black/10 font-medium"
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="max-w-3xl text-sm text-black/60 leading-relaxed font-sans mt-2">
                      {selectedProject.description}
                    </p>

                    {/* Responsive 4-Column Grid per Image 1 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      {selectedProject.subProjects.map((subProj, i) => {
                        const itemTag = subProj.tag;
                        const title = subProj.title;
                        
                        // Apply filter
                        if (selectedTagFilter !== "ALL" && itemTag !== selectedTagFilter) {
                          return null;
                        }

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 15 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => setSelectedGalleryItemIndex(i)}
                            className="cursor-pointer group flex flex-col justify-between"
                          >
                            <div className="rounded-[24px] overflow-hidden bg-stone-50 border border-black/5 aspect-[4/3] sm:aspect-square relative flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow group">
                              {/* Admin edit and delete overlays */}
                              {isAdmin && (
                                <div className="absolute top-4 left-4 z-50 flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleEditSubProject(i)}
                                    className="w-8 h-8 rounded-full bg-black hover:bg-[#D9FF33] hover:text-black text-[10px] text-white flex items-center justify-center border border-white/20 shadow-lg hover:scale-115 active:scale-85 transition-all cursor-pointer"
                                    title="编辑内容文本与图片集"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSubProject(i)}
                                    className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 text-[10px] text-white flex items-center justify-center border border-red-500/15 shadow-lg hover:scale-115 active:scale-85 transition-all cursor-pointer"
                                    title="删除此演示项目"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}

                              <img 
                                src={getOverriddenImg(subProj.images[0])} 
                                alt={title} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                referrerPolicy="no-referrer"
                              />
                              {isAdmin && (
                                <ImageUploadOverlay 
                                  originalUrl={subProj.images[0]}
                                  onUploaded={(url) => handleImageUploaded(subProj.images[0], url)}
                                />
                              )}
                              {/* Overlay viewer caption */}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                <span className="text-white text-xs font-mono border border-white/30 px-4 py-2 rounded-full backdrop-blur-sm tracking-wider uppercase">
                                  查看项目详情 VIEW DETAIL
                                </span>
                              </div>
                            </div>
                            
                            {/* Black Ribbed Bar under the cell (captions like Image 1) */}
                            <div className="mt-3 bg-black text-white px-3.5 py-2.5 text-[11px] font-mono tracking-wider flex items-center justify-between rounded-xl shadow-sm group-hover:bg-neutral-900 transition-colors">
                              <span className="truncate pr-2 font-medium">{title}</span>
                              <span className="text-neon-green shrink-0 font-bold text-[9px] uppercase">DETAIL</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : (
                  // ================= THIRD LEVEL INTERFACE (Image 2 Model) =================
                  <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-16"
                  >
                    {/* Primary Two-Column Details View */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                      {/* Left Side: Massive visual card (col-span-8) */}
                      <div className="lg:col-span-8 space-y-6">
                        <div className="rounded-[30px] overflow-hidden bg-[#fafafa] border border-black/5 aspect-[4/3] md:aspect-video shadow-lg flex items-center justify-center relative group">
                          {showSlowLoader && (
                            <div className="absolute inset-0 bg-[#f7f7f7] flex flex-col items-center justify-center z-10 transition-all duration-300">
                              {/* Sleek Minimalist Loading indicator */}
                              <div className="w-9 h-9 border-[3px] border-black/5 border-t-neon-green rounded-full animate-spin" />
                              <div className="mt-4 flex flex-col items-center gap-1.5 px-4 text-center">
                                <p className="text-[10px] font-mono tracking-widest text-black/50 uppercase font-black animate-pulse">
                                  Loading Design Concept...
                                </p>
                                <p className="text-[9px] font-mono text-black/30">
                                  正在为您加载超清视觉设计稿
                                </p>
                              </div>
                            </div>
                          )}
                          <motion.img 
                            key={selectedProject.subProjects[selectedGalleryItemIndex].images[activeImageIndex]}
                            src={getOverriddenImg(selectedProject.subProjects[selectedGalleryItemIndex].images[activeImageIndex])} 
                            alt={`${selectedProject.subProjects[selectedGalleryItemIndex].title} Detail ${activeImageIndex}`}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onLoad={() => {
                              setIsImageLoading(false);
                              setShowSlowLoader(false);
                              if (loaderTimerRef.current) {
                                clearTimeout(loaderTimerRef.current);
                                loaderTimerRef.current = null;
                              }
                            }}
                            onError={() => {
                              setIsImageLoading(false);
                              setShowSlowLoader(false);
                              if (loaderTimerRef.current) {
                                clearTimeout(loaderTimerRef.current);
                                loaderTimerRef.current = null;
                              }
                            }}
                            initial={{ opacity: 0.3, scale: 0.98 }}
                            animate={{ opacity: isImageLoading ? 0.3 : 1, scale: isImageLoading ? 0.98 : 1 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                          />
                          {isAdmin && (
                            <ImageUploadOverlay 
                              originalUrl={selectedProject.subProjects[selectedGalleryItemIndex].images[activeImageIndex]}
                              onUploaded={(url) => handleImageUploaded(selectedProject.subProjects[selectedGalleryItemIndex].images[activeImageIndex], url)}
                            />
                          )}
                        </div>

                        {/* Interactive Thumbnail Selection Row (Under main div) */}
                        <div className="py-2.5 border-y border-neutral-100">
                          <p className="text-[11px] font-mono uppercase tracking-widest text-black/40 mb-3 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-neon-green" />
                            <span>方案选集 / SELECT CONCEPT IMAGES</span>
                          </p>
                           <div className="flex gap-3 overflow-x-auto scrollbar-none py-1 items-center">
                            {selectedProject.subProjects[selectedGalleryItemIndex].images.map((imgUrl, idx) => (
                              <div key={idx} className="relative group/thumb shrink-0">
                                <button
                                  onClick={() => setActiveImageIndex(idx)}
                                  className={`relative flex-shrink-0 aspect-[4/3] w-20 md:w-28 rounded-xl overflow-hidden border transition-all duration-300 cursor-pointer ${
                                    idx === activeImageIndex 
                                      ? "border-black ring-2 ring-black/15 shadow-md scale-95" 
                                      : "border-black/5 hover:border-black/30 opacity-60 hover:opacity-100"
                                  }`}
                                >
                                  <img 
                                    src={getOverriddenImg(imgUrl)} 
                                    alt={`Concept ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  {idx === activeImageIndex && (
                                    <div className="absolute inset-0 border-2 border-neon-green rounded-[10px] pointer-events-none" />
                                  )}
                                </button>
                                
                                {/* Inline delete button for admin to control the number of images */}
                                {isAdmin && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteImageFromActiveSubProj(idx);
                                    }}
                                    className="absolute -top-1.5 -right-1.5 z-50 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg cursor-pointer text-[8px] font-bold border border-white/20 transition-transform scale-90 hover:scale-110 active:scale-75"
                                    title="删除此图片"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}

                            {/* Direct Append Image feature on the thumbnails row for admin */}
                            {isAdmin && (
                              <div className="relative shrink-0">
                                <input 
                                  type="file" 
                                  ref={subProjectImgInputRef} 
                                  onChange={handleSubProjectImgMetaFileChange} 
                                  accept="image/*" 
                                  className="hidden" 
                                />
                                <button
                                  onClick={() => subProjectImgInputRef.current?.click()}
                                  className="flex-shrink-0 aspect-[4/3] w-20 md:w-28 rounded-xl bg-neutral-50 hover:bg-neutral-100 border border-dashed border-neutral-300 hover:border-neutral-500 text-neutral-600 font-sans font-black flex flex-col items-center justify-center transition-all text-[9px] cursor-pointer hover:shadow-inner"
                                  title="上传新图片并加入此项目"
                                >
                                  <span className="text-sm">➕</span>
                                  <span className="text-[8px] font-mono tracking-widest mt-0.5">UPLOAD</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => setSelectedGalleryItemIndex(null)}
                          className="inline-flex items-center gap-2 group text-sm text-black/50 hover:text-black font-mono transition-colors"
                        >
                          <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                          <span>返回 {selectedProject.title} 展示目录</span>
                        </button>
                      </div>

                      {/* Right Side: Specific parameters & action sidebar (col-span-4) */}
                      <div className="lg:col-span-4">
                        <div className="space-y-6">
                          {/* Breadcrumb links & Date (Image 2 Replica) */}
                          <div>
                            <div className="flex items-center gap-2 text-[11px] font-mono text-black/40 uppercase tracking-widest">
                              <button 
                                onClick={() => setSelectedGalleryItemIndex(null)}
                                className="hover:text-black hover:underline transition-colors"
                              >
                                {selectedProject.category}
                              </button>
                              <span>/</span>
                              <span className="text-black font-semibold">{selectedProject.title}</span>
                            </div>
                            <p className="text-[11px] font-mono text-neutral-400 mt-2">
                              项目发布：{selectedProject.time.split(" ")[0]}年10月
                            </p>
                          </div>

                          {/* Bold Title */}
                          <div className="space-y-3">
                            <div className="inline-block px-3 py-1 text-[10px] font-mono font-bold bg-neon-green text-black uppercase rounded-md tracking-wider">
                              {selectedProject.subProjects[selectedGalleryItemIndex].tag}
                            </div>
                            <h3 className="text-3xl font-sans font-black tracking-tight text-black mt-2 leading-tight">
                              {selectedProject.subProjects[selectedGalleryItemIndex].title}
                            </h3>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-black/60 leading-relaxed pt-3 border-t border-black/5">
                            {selectedProject.subProjects[selectedGalleryItemIndex].description}
                          </p>

                          {/* Solid Download/Contact Action Button (Image 2 Replica) */}
                          <div className="pt-2">
                            <button 
                              onClick={() => setShowQRCode(true)} 
                              className="w-full bg-black text-white hover:bg-neon-green hover:text-black font-sans font-black tracking-tight py-4 rounded-xl text-center text-sm transition-all duration-300 border border-black/5 shadow-md hover:shadow-lg cursor-pointer flex items-center justify-center gap-2 uppercase"
                            >
                              获取设计方案 / Get Design Mockup
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Related designs horizontal deck (Recent Mockups in Image 2 Replica) */}
                    <div className="pt-16 border-t border-black/10 space-y-6">
                      <h4 className="text-xl font-sans font-black tracking-tight text-black flex items-center gap-2 uppercase">
                        <span>其他项目方案推荐 / Other Design Concepts</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-neon-green" />
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {selectedProject.subProjects.map((subProj, ri) => (
                          <div 
                            key={ri}
                            onClick={() => setSelectedGalleryItemIndex(ri)}
                            className={`space-y-3 cursor-pointer group transition-all duration-300 ${
                              ri === selectedGalleryItemIndex ? "opacity-100 scale-[1.02]" : "opacity-60 hover:opacity-100"
                            }`}
                          >
                            <div className={`overflow-hidden rounded-2xl aspect-[4/3] border shadow-sm transition-all duration-300 ${
                              ri === selectedGalleryItemIndex 
                                ? "border-black ring-2 ring-black bg-[#f5f5f5]" 
                                : "border-black/5 hover:border-black/20"
                            }`}>
                              <img 
                                src={getOverriddenImg(subProj.images[0])} 
                                alt={subProj.title} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="bg-black text-white px-3 py-2 text-[10px] font-sans tracking-wide truncate rounded-lg font-bold">
                              {subProj.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <footer className="py-20 bg-black text-white px-6 md:px-12 flex flex-col items-center gap-8 mt-20">
                <h3 className="text-3xl font-serif italic font-black tracking-tighter">Thanks for watching!</h3>
                <motion.button 
                  onClick={() => setSelectedProject(null)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 450, damping: 28 }}
                  className="bg-neon-green text-black px-10 py-3 rounded-full font-bold text-sm cursor-pointer shadow-lg hover:shadow-[0_8px_30px_rgba(163,255,18,0.4)] transition-all duration-300"
                >
                  返回作品目录
                </motion.button>
              </footer>
            </div>
          </motion.div>
        )}

        {showQRCode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setShowQRCode(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-8 rounded-[40px] max-w-sm w-full relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowQRCode(false)}
                className="absolute top-6 right-6 w-12 h-12 rounded-full border border-black/10 flex items-center justify-center bg-transparent text-black/40 hover:bg-black hover:text-white hover:scale-105 active:scale-95 transition-all duration-150 ease-out cursor-pointer origin-center group"
              >
                <X className="w-5 h-5 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200 ease-out" />
              </button>
              
              <div className="space-y-6 pt-4">
                <div className="text-center">
                  <h3 className="text-2xl font-serif italic text-black font-black uppercase tracking-tighter">WeChat Code</h3>
                  <p className="text-black/40 text-sm mt-2">扫一扫，加我为朋友</p>
                </div>
                
                <div className="aspect-square bg-white rounded-3xl overflow-hidden shadow-inner border border-black/5 p-4 flex items-center justify-center relative group">
                  <img 
                    src={getOverriddenImg("/assets/images/regenerated_image_1778551850611.png")} 
                    alt="WeChat QR Code"
                    className="w-full h-full object-contain"
                  />
                  {isAdmin && (
                    <ImageUploadOverlay 
                      originalUrl="/assets/images/regenerated_image_1778551850611.png"
                      onUploaded={(url) => handleImageUploaded("/assets/images/regenerated_image_1778551850611.png", url)}
                    />
                  )}
                </div>
                
                <div className="p-4 bg-neon-green rounded-2xl border border-neon-green flex items-center justify-center shadow-sm">
                  <span className="text-black font-bold text-sm">微信扫码添加</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Authorization Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-neutral-900 border border-neutral-800 text-white p-8 rounded-3xl max-w-sm w-full shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative"
            >
              <button 
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthPassword("");
                  setAuthError("");
                }}
                className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#D9FF33]/10 flex items-center justify-center border border-[#D9FF33]/20">
                  <Fingerprint className="w-6 h-6 text-[#D9FF33]" />
                </div>
                <div>
                  <h3 className="font-serif italic font-black text-xl text-stone-100">管理权限校验</h3>
                  <p className="text-[10px] text-neutral-400 font-mono mt-1 uppercase tracking-widest">ADMIN SECURITY PROTOCOL</p>
                </div>
                
                <div className="w-full space-y-2 pt-2">
                  <input
                    type="password"
                    placeholder="请输入管理员密码"
                    value={authPassword}
                    onChange={(e) => {
                      setAuthPassword(e.target.value);
                      setAuthError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAuthenticate();
                      }
                    }}
                    className="w-full bg-neutral-950 text-stone-100 text-center text-sm px-4 py-3 border border-neutral-800 rounded-xl focus:outline-none focus:border-[#D9FF33] transition-colors font-sans tracking-widest placeholder:text-neutral-600 placeholder:tracking-normal"
                    autoFocus
                  />
                  {authError && (
                    <p className="text-red-500 font-bold text-[11px] text-center mt-1 animate-pulse">
                      ⚡ {authError}
                    </p>
                  )}
                </div>
                
                <button
                  onClick={handleAuthenticate}
                  className="w-full bg-[#D9FF33] text-black font-black text-xs uppercase tracking-widest py-3.5 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-[#D9FF33]/20"
                >
                  验证并开启编辑 UNLOCK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subproject Editing Modal */}
      <AnimatePresence>
        {editingSubProjectIdx !== null && editingSubProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.93, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 15 }}
              className="bg-neutral-900 border border-neutral-800 text-stone-100 p-8 rounded-[32px] max-w-lg w-full shadow-2xl space-y-6 my-8"
            >
              <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
                <div>
                  <h3 className="font-serif italic font-black text-xl text-[#D9FF33]">
                    {editingSubProjectIdx === -1 ? "新增设计子项目" : "编辑子项目详情"}
                  </h3>
                  <p className="text-[10px] text-neutral-400 font-mono tracking-widest mt-0.5">SUBPROJECT PORTFOLIO EDITOR</p>
                </div>
                <button 
                  onClick={() => {
                    setEditingSubProjectIdx(null);
                    setEditingSubProject(null);
                  }}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono tracking-wider text-neutral-400 uppercase">项目名称 / Project Title</label>
                  <input
                    type="text"
                    value={editingSubProject.title}
                    onChange={(e) => setEditingSubProject({ ...editingSubProject, title: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-[#D9FF33] focus:outline-none p-3 rounded-xl text-sm"
                  />
                </div>

                {/* Tag / Category selection */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono tracking-wider text-neutral-400 uppercase">标签分类 / Category Tag</label>
                  <input
                    type="text"
                    placeholder="例如：企业画册、企业文化墙"
                    value={editingSubProject.tag}
                    onChange={(e) => setEditingSubProject({ ...editingSubProject, tag: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-[#D9FF33] focus:outline-none p-3 rounded-xl text-sm"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono tracking-wider text-neutral-400 uppercase">项目描述 / Project Description</label>
                  <textarea
                    rows={3}
                    value={editingSubProject.description}
                    onChange={(e) => setEditingSubProject({ ...editingSubProject, description: e.target.value })}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-[#D9FF33] focus:outline-none p-3 rounded-xl text-sm leading-relaxed"
                  />
                </div>

                {/* Managing the number of images */}
                <div className="space-y-2">
                  <label className="text-[11px] font-mono tracking-wider text-neutral-400 uppercase block">
                    管理项目图片 / Manage Image Gallery ({editingSubProject.images.length})
                  </label>
                  
                  <div className="grid grid-cols-3 gap-3">
                    {editingSubProject.images.map((img, imgIdx) => (
                      <div key={imgIdx} className="relative aspect-[4/3] rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950 group">
                        <img src={getOverriddenImg(img)} alt="" className="w-full h-full object-cover" />
                        <button
                          onClick={() => {
                            const updated = editingSubProject.images.filter((_, tempI) => tempI !== imgIdx);
                            setEditingSubProject({ ...editingSubProject, images: updated });
                          }}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center text-[8px] font-bold shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-90"
                          title="删除此图"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    
                    {/* Embedded dynamic image builder */}
                    <div 
                      onClick={() => {
                        const url = window.prompt("请直接输入网络图片URL地址：");
                        if (url) {
                          setEditingSubProject({
                            ...editingSubProject,
                            images: [...editingSubProject.images, url]
                          });
                        }
                      }}
                      className="aspect-[4/3] rounded-lg border border-dashed border-neutral-850 hover:border-[#D9FF33] flex flex-col items-center justify-center text-[10px] text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <span>🔗 添加URL</span>
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <input
                      type="file"
                      id="modal-image-uploader"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const base64 = reader.result as string;
                          const compressed = await compressImage(base64);
                          const response = await fetch("/api/upload", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              fileName: file.name,
                              fileContent: compressed,
                              originalUrl: `/assets/images/proj_${Date.now()}_${file.name}`
                            })
                          });
                          if (response.ok) {
                            const data = await response.json();
                            setEditingSubProject({
                              ...editingSubProject,
                              images: [...editingSubProject.images, data.relativeUrl || compressed]
                            });
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById("modal-image-uploader")?.click()}
                      className="w-full py-2 bg-neutral-800 hover:bg-neutral-750 text-xs font-bold rounded-lg cursor-pointer text-center text-stone-200 transition-colors border border-neutral-750/50"
                    >
                      📷 本地上传新图片 (+ Local Photo)
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditingSubProjectIdx(null);
                    setEditingSubProject(null);
                  }}
                  className="w-1/3 py-3 bg-neutral-800 hover:bg-neutral-750 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                >
                  取消 CANCEL
                </button>
                <button
                  onClick={handleSaveSubProjectDetails}
                  className="w-2/3 py-3 bg-[#D9FF33] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-[#D9FF33]/15"
                >
                  保存并同步数据 SAVE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Static Save Falling Back Information Dialog */}
      <AnimatePresence>
        {showStaticSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[99999] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="bg-neutral-900 border border-neutral-800 text-stone-100 p-8 rounded-[32px] max-w-sm w-full shadow-[0_25px_60px_rgba(0,0,0,0.8)] relative"
            >
              <button
                onClick={() => setShowStaticSaveModal(false)}
                className="absolute top-5 right-5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-[#D9FF33]/10 flex items-center justify-center border border-[#D9FF33]/30">
                  <Download className="w-7 h-7 text-[#D9FF33]" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="font-serif italic font-black text-2xl text-stone-50">本地临时保存成功！</h3>
                  <p className="text-[10px] text-neutral-400 font-mono mt-1.5 uppercase tracking-widest leading-none">STATIC HOSTING DETECTED</p>
                </div>

                <div className="text-left text-xs text-neutral-300 leading-relaxed font-sans space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-850 w-full">
                  <p>
                    ⚡ <span className="text-white font-bold">已在当前浏览器中保存：</span>所有新上传图片和修改内容在您的浏览器缓存中已<strong>即时生效并持久储存</strong>，在此设备刷新重新打开网站均可正常展示！
                  </p>
                  <p>
                    🌐 <span className="text-white font-bold">固化到您的电脑/代码中：</span>因项目目前是作为静态页面直接展现（如 Netlify ），没有活动的运行后台，故无法写入到服务器磁盘。
                  </p>
                  <p>
                    💎 <span className="text-white font-bold">一键永久固化方案：</span>请直接点击下方按钮导出修改后的配置文件，然后替换您电脑源项目 `/src/` 下对应的同名 JSON 文件，重新打包发布即可全端永久显示！
                  </p>
                </div>

                <div className="w-full flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(imageOverrides, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", "image-overrides.json");
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    }}
                    className="w-full bg-[#D9FF33] hover:bg-[#c2e62e] text-black font-black text-xs uppercase tracking-wider py-3.5 rounded-xl cursor-pointer shadow-lg shadow-[#D9FF33]/15 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all"
                  >
                    <Download className="w-4 h-4 shrink-0" strokeWidth={3} />
                    <span>📥 导出图片配置文件 (image-overrides)</span>
                  </button>

                  <button
                    onClick={() => {
                      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projects, null, 2));
                      const downloadAnchor = document.createElement('a');
                      downloadAnchor.setAttribute("href", dataStr);
                      downloadAnchor.setAttribute("download", "portfolio-data.json");
                      document.body.appendChild(downloadAnchor);
                      downloadAnchor.click();
                      downloadAnchor.remove();
                    }}
                    className="w-full bg-neutral-850 hover:bg-neutral-800 text-stone-100 font-bold text-xs uppercase tracking-wider py-3.5 rounded-xl cursor-pointer border border-neutral-750 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>📥 导出作品内容文件 (portfolio-data)</span>
                  </button>
                </div>

                <div className="text-[9px] text-neutral-500 font-serif leading-tight">
                  ※ 导出后，仅需替换本地代码项目中的 src/image-overrides.json 和 src/portfolio-data.json 即可！
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Mode Toggle FAB */}
      <div className="fixed bottom-6 left-6 z-[9999] pointer-events-auto flex items-center gap-3">
        <div className="group">
          <button 
            onClick={() => {
              if (isAdmin) {
                setIsAdmin(false);
              } else {
                setShowAuthModal(true);
              }
            }}
            className={`flex items-center h-12 rounded-full font-sans font-black text-xs uppercase tracking-widest border shadow-[3px_3px_0px_#000] cursor-pointer transition-all duration-300 ease-out active:translate-y-0.5 active:shadow-[1px_1px_0px_#000] focus:outline-none overflow-hidden ${
              isAdmin 
                ? "bg-[#D9FF33] text-black border-black border-2 w-12 hover:w-56 px-0 hover:px-5" 
                : "bg-black text-white hover:bg-neutral-900 border-white/20 hover:border-white w-12 hover:w-48 px-0 hover:px-5"
            }`}
          >
            {isAdmin ? (
              <div className="flex items-center w-full">
                {/* Collapsed state display icon with active indicator */}
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center relative">
                  <span className="text-base select-none">✏️</span>
                  <span className="absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full bg-black border border-[#D9FF33] animate-pulse" />
                </div>
                {/* Expanding text container */}
                <span className="opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-xs transition-all duration-300 ease-out whitespace-nowrap overflow-hidden pr-4 leading-none select-none">
                  编辑模式 ON
                </span>
              </div>
            ) : (
              <div className="flex items-center w-full">
                {/* Collapsed state display wrench */}
                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center">
                  <span className="text-base select-none">🛠️</span>
                </div>
                {/* Expanding text container */}
                <span className="opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-xs transition-all duration-300 ease-out whitespace-nowrap overflow-hidden pr-4 leading-none select-none">
                  启动编辑模式
                </span>
              </div>
            )}
          </button>
        </div>

        {isAdmin && (
          <button
            onClick={saveAllChanges}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 h-12 px-5 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-white font-sans font-black text-xs uppercase tracking-widest border border-black shadow-[3px_3px_0px_#000] cursor-pointer transition-all duration-300 ease-out active:translate-y-0.5 active:shadow-[1px_1px_0px_#000] disabled:opacity-50"
          >
            <span>{isSaving ? "⏳ 正在保存..." : "💾 固化图片与内容 SAVE"}</span>
          </button>
        )}
      </div>

      {/* SVG Clip Path Definition */}
      <svg width="0" height="0" className="absolute pointer-events-none">
        <defs>
          <clipPath id="hero-clip-path" clipPathUnits="objectBoundingBox">
            <path d="M 0,0.1 
                     C 0,0.05 0.01,0 0.04,0 
                     L 0.14,0 
                     C 0.16,0 0.17,0.005 0.18,0.015 
                     L 0.19,0.025 
                     C 0.20,0.035 0.22,0.04 0.24,0.04 
                     L 0.76,0.04 
                     C 0.78,0.04 0.80,0.035 0.81,0.025 
                     L 0.82,0.015 
                     C 0.83,0.005 0.84,0 0.86,0 
                     L 0.96,0 
                     C 0.99,0 1,0.05 1,0.1 
                     V 0.93 
                     C 1,0.97 0.98,1 0.95,1 
                     H 0.05 
                     C 0.02,1 0,0.97 0,0.93 
                     Z" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
