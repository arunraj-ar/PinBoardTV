import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingCart,
  CheckSquare,
  StickyNote,
  Camera,
  Wifi,
  LogOut,
  Image as ImageIcon,
  Edit3,
  Trash2,
  Plus,
  X,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { storageSync } from '../services/storageSync';
import type {
  HouseholdState,
  MemberSession,
  NoteColor,
  MagnetStyle,
  PinNote,
  ChecklistItem,
} from '../types/pinboard';
import { playPinPopSound, playCheckmarkSound } from '../services/soundEffects';

interface MobileAppProps {
  onLogout: () => void;
}

type ActiveSheet = 'NONE' | 'GROCERY' | 'CHORE' | 'STICKY' | 'POLAROID';

const AVAILABLE_COLORS: { id: NoteColor; label: string; bgClass: string; textClass: string; borderClass: string }[] = [
  { id: 'yellow', label: 'Yellow', bgClass: 'bg-amber-200', textClass: 'text-amber-950', borderClass: 'border-amber-400' },
  { id: 'pink', label: 'Pink', bgClass: 'bg-rose-200', textClass: 'text-rose-950', borderClass: 'border-rose-400' },
  { id: 'blue', label: 'Blue', bgClass: 'bg-sky-200', textClass: 'text-sky-950', borderClass: 'border-sky-400' },
  { id: 'green', label: 'Green', bgClass: 'bg-emerald-200', textClass: 'text-emerald-950', borderClass: 'border-emerald-400' },
  { id: 'orange', label: 'Orange', bgClass: 'bg-orange-200', textClass: 'text-orange-950', borderClass: 'border-orange-400' },
  { id: 'cream', label: 'Cream', bgClass: 'bg-stone-200', textClass: 'text-stone-900', borderClass: 'border-stone-400' },
];

const AVAILABLE_MAGNETS: { id: MagnetStyle; label: string; icon: string }[] = [
  { id: 'brass-pin', label: 'Brass Pin', icon: '📌' },
  { id: 'red-dot', label: 'Red Magnet', icon: '🔴' },
  { id: 'blue-star', label: 'Blue Star', icon: '⭐' },
  { id: 'washi-tape', label: 'Washi Tape', icon: '🏷️' },
];

export const MobileApp: React.FC<MobileAppProps> = ({ onLogout }) => {
  const [state, setState] = useState<HouseholdState>(storageSync.getHouseholdState());
  const [session, setSession] = useState<MemberSession | null>(storageSync.getSession());
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>('NONE');

  // Add Form states
  const [groceryMode, setGroceryMode] = useState<'existing' | 'new'>('existing');
  const [targetGroceryNoteId, setTargetGroceryNoteId] = useState<string>('');
  const [newGroceryTitle, setNewGroceryTitle] = useState<string>('');
  const [groceryInput, setGroceryInput] = useState<string>('');
  const [groceryColor, setGroceryColor] = useState<NoteColor>('green');

  const [choreTitle, setChoreTitle] = useState<string>('');
  const [choreAssignee, setChoreAssignee] = useState<string>('');
  const [chorePriority, setChorePriority] = useState<'LOW' | 'MED' | 'HIGH'>('MED');
  const [choreSubtasks, setChoreSubtasks] = useState<string>('');
  const [choreColor, setChoreColor] = useState<NoteColor>('orange');

  const [stickyTitle, setStickyTitle] = useState<string>('');
  const [stickyContent, setStickyContent] = useState<string>('');
  const [stickyColor, setStickyColor] = useState<NoteColor>('yellow');
  const [stickyMagnet, setStickyMagnet] = useState<MagnetStyle>('brass-pin');

  const [polaroidCaption, setPolaroidCaption] = useState<string>('');
  const [polaroidImage, setPolaroidImage] = useState<string | null>(null);
  const [polaroidMagnet, setPolaroidMagnet] = useState<MagnetStyle>('blue-star');

  // Edit Note states
  const [editingNote, setEditingNote] = useState<PinNote | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editContent, setEditContent] = useState<string>('');
  const [editColor, setEditColor] = useState<NoteColor>('yellow');
  const [editMagnet, setEditMagnet] = useState<MagnetStyle>('brass-pin');
  const [editAssignee, setEditAssignee] = useState<string>('');
  const [editPriority, setEditPriority] = useState<'LOW' | 'MED' | 'HIGH'>('MED');
  const [editItems, setEditItems] = useState<ChecklistItem[]>([]);
  const [newEditItemText, setNewEditItemText] = useState<string>('');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [isEditDirty, setIsEditDirty] = useState<boolean>(false);

  // Confirmation states
  const [noteToDeleteMobile, setNoteToDeleteMobile] = useState<PinNote | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = storageSync.subscribe((newState) => {
      setState(newState);
      setSession(storageSync.getSession());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (state.members.length > 0 && !choreAssignee) {
      setChoreAssignee(state.members[0].id);
    }
  }, [state.members, choreAssignee]);

  // Handle client-side canvas photo compression (<100KB, max 800px)
  const processImageFile = (file: File, onSuccess: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          onSuccess(compressedDataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file, (dataUrl) => setPolaroidImage(dataUrl));
  };

  const handleEditPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file, (dataUrl) => {
      setEditImageUrl(dataUrl);
      setIsEditDirty(true);
    });
  };

  // Add Groceries (either append to existing note or create brand new list)
  const handleAddGroceries = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groceryInput.trim()) return;

    playPinPopSound();
    const lines = groceryInput
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const existingGroceryNotes = state.notes.filter((n) => n.type === 'GROCERY');
    const shouldAppend = groceryMode === 'existing' && existingGroceryNotes.length > 0;

    if (shouldAppend) {
      const targetId = targetGroceryNoteId || existingGroceryNotes[0]?.id || 'note_groceries_01';
      lines.forEach((itemText) => {
        storageSync.addChecklistItem(
          targetId,
          itemText,
          'General',
          session?.displayName || 'Mobile'
        );
      });
    } else {
      // Create a brand new Grocery / Checklist Pin
      const newItems: ChecklistItem[] = lines.map((text, idx) => ({
        id: `item_${Date.now()}_${idx}`,
        text,
        done: false,
        category: 'General',
        addedBy: session?.displayName || 'Mobile',
      }));

      storageSync.addNote({
        type: 'GROCERY',
        title: newGroceryTitle.trim() || '🛒 Grocery List',
        color: groceryColor,
        magnet: 'red-dot',
        rotationDeg: Math.random() * 4 - 2,
        createdByMemberId: session?.memberId || 'mobile',
        pinned: true,
        items: newItems,
      });
    }

    setGroceryInput('');
    setNewGroceryTitle('');
    setActiveSheet('NONE');
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.8 } });
  };

  // Add Chore
  const handleAddChore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choreTitle.trim()) return;

    playPinPopSound();
    const assignee = state.members.find((m) => m.id === choreAssignee);

    const subtaskLines = choreSubtasks
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const items: ChecklistItem[] =
      subtaskLines.length > 0
        ? subtaskLines.map((text, idx) => ({
            id: `ch_${Date.now()}_${idx}`,
            text,
            done: false,
          }))
        : [{ id: `ch_${Date.now()}`, text: choreTitle.trim(), done: false }];

    storageSync.addNote({
      type: 'CHORE',
      title: choreTitle.trim().startsWith('⚡') ? choreTitle.trim() : `⚡ ${choreTitle.trim()}`,
      color: choreColor,
      magnet: 'red-dot',
      rotationDeg: Math.random() * 4 - 2,
      assignedToMemberId: choreAssignee || state.members[0]?.id,
      assignedToName: assignee?.name || state.members[0]?.name || 'Family',
      createdByMemberId: session?.memberId || 'mobile',
      pinned: true,
      priority: chorePriority,
      items,
    });

    setChoreTitle('');
    setChoreSubtasks('');
    setActiveSheet('NONE');
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
  };

  // Add Sticky Note
  const handleAddSticky = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stickyTitle.trim()) return;

    playPinPopSound();
    storageSync.addNote({
      type: 'STICKY',
      title: stickyTitle.trim(),
      content: stickyContent.trim(),
      color: stickyColor,
      magnet: stickyMagnet,
      rotationDeg: Math.random() * 4 - 2,
      createdByMemberId: session?.memberId || 'mobile',
      pinned: true,
    });

    setStickyTitle('');
    setStickyContent('');
    setActiveSheet('NONE');
    confetti({ particleCount: 35, spread: 55, origin: { y: 0.8 } });
  };

  // Add Polaroid Photo
  const handleAddPolaroid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!polaroidImage) return;

    playPinPopSound();
    storageSync.addNote({
      type: 'POLAROID',
      title: polaroidCaption.trim() || 'Family Memory',
      content: polaroidCaption.trim(),
      imageUrl: polaroidImage,
      color: 'cream',
      magnet: polaroidMagnet,
      rotationDeg: Math.random() * 4 - 2,
      createdByMemberId: session?.memberId || 'mobile',
      pinned: true,
    });

    setPolaroidCaption('');
    setPolaroidImage(null);
    setActiveSheet('NONE');
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.8 } });
  };

  // Open Edit Note Modal
  const openEditModal = (note: PinNote) => {
    playPinPopSound();
    setEditingNote(note);
    setEditTitle(note.title);
    setEditContent(note.content || '');
    setEditColor(note.color);
    setEditMagnet(note.magnet);
    setEditAssignee(note.assignedToMemberId || state.members[0]?.id || '');
    setEditPriority(note.priority || 'MED');
    setEditItems(note.items ? note.items.map((it) => ({ ...it })) : []);
    setNewEditItemText('');
    setEditImageUrl(note.imageUrl || null);
    setIsEditDirty(false);
  };

  // Request Close Edit Modal (check dirty status)
  const handleRequestCloseEdit = () => {
    if (isEditDirty) {
      setShowDiscardConfirm(true);
    } else {
      setEditingNote(null);
      setIsEditDirty(false);
    }
  };

  // Save Changes to Note
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote) return;
    if (!editTitle.trim()) return;

    playPinPopSound();
    const assignee = state.members.find((m) => m.id === editAssignee);

    const changes: Partial<PinNote> = {
      title: editTitle.trim(),
      color: editColor,
      magnet: editMagnet,
    };

    if (editingNote.type === 'STICKY') {
      changes.content = editContent.trim();
    } else if (editingNote.type === 'GROCERY') {
      changes.items = editItems;
    } else if (editingNote.type === 'CHORE') {
      changes.assignedToMemberId = editAssignee;
      changes.assignedToName = assignee?.name || 'Family';
      changes.priority = editPriority;
      changes.items = editItems;
    } else if (editingNote.type === 'POLAROID') {
      changes.content = editContent.trim();
      if (editImageUrl) changes.imageUrl = editImageUrl;
    }

    storageSync.updateNote(editingNote.id, changes);
    setEditingNote(null);
    setIsEditDirty(false);
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
  };

  // Trigger Delete Confirmation Dialog
  const promptDeleteNote = (note: PinNote) => {
    playPinPopSound();
    setNoteToDeleteMobile(note);
  };

  // Confirm Note Deletion
  const handleConfirmDeleteMobile = () => {
    if (!noteToDeleteMobile) return;
    playPinPopSound();
    storageSync.deleteNote(noteToDeleteMobile.id);
    if (editingNote && editingNote.id === noteToDeleteMobile.id) {
      setEditingNote(null);
      setIsEditDirty(false);
    }
    setNoteToDeleteMobile(null);
  };

  // Toggle item in edit list
  const toggleEditItem = (itemId: string) => {
    let nextState = false;
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          nextState = !it.done;
          return { ...it, done: nextState };
        }
        return it;
      })
    );
    playCheckmarkSound(nextState);
    setIsEditDirty(true);
  };

  // Delete item from edit list
  const removeEditItem = (itemId: string) => {
    playPinPopSound();
    setEditItems((prev) => prev.filter((it) => it.id !== itemId));
    setIsEditDirty(true);
  };

  // Add new item to edit list
  const handleAddEditItem = () => {
    if (!newEditItemText.trim()) return;
    playPinPopSound();
    const newItem: ChecklistItem = {
      id: `it_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      text: newEditItemText.trim(),
      done: false,
      category: 'General',
      addedBy: session?.displayName || 'Mobile',
    };
    setEditItems((prev) => [...prev, newItem]);
    setNewEditItemText('');
    setIsEditDirty(true);
  };

  const groceryNotes = state.notes.filter((n) => n.type === 'GROCERY');

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col max-w-md mx-auto relative pb-24">
      {/* Top Header */}
      <header className="p-4 bg-stone-900 border-b border-white/10 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center font-black text-stone-950 text-lg shadow-md">
            {session?.displayName?.charAt(0) || '👤'}
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              {session?.displayName || 'Family Companion'}
            </h2>
            <span className="text-xs text-stone-400">{state.householdName}</span>
          </div>
        </div>

        <button
          onClick={() => {
            storageSync.clearSession();
            onLogout();
          }}
          className="text-stone-400 hover:text-white p-2 rounded-lg bg-stone-800/80 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Sign out of household"
        >
          <LogOut className="w-4 h-4" />
          <span>Exit</span>
        </button>
      </header>

      {/* Wi-Fi Verification Banner */}
      <div className="px-4 py-2.5 bg-emerald-950/70 border-b border-emerald-500/30 flex items-center justify-between text-xs font-semibold text-emerald-300">
        <div className="flex items-center space-x-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span>Connected to Living Room TV</span>
        </div>
        <span className="bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-200 text-[10px] uppercase font-bold tracking-wider">
          Wi-Fi Verified
        </span>
      </div>

      {/* Quick Action Grid: Add New Pins */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            playPinPopSound();
            setActiveSheet('GROCERY');
          }}
          className="p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-400 text-stone-950 flex items-center justify-center mb-2 shadow-md group-hover:scale-105 transition-transform">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-sm text-white">+ Groceries</span>
          <span className="text-[11px] text-stone-400">Add or create list</span>
        </button>

        <button
          onClick={() => {
            playPinPopSound();
            setActiveSheet('CHORE');
          }}
          className="p-4 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center mb-2 shadow-md group-hover:scale-105 transition-transform">
            <CheckSquare className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-sm text-white">+ Assign Chore</span>
          <span className="text-[11px] text-stone-400">Give task to family</span>
        </button>

        <button
          onClick={() => {
            playPinPopSound();
            setActiveSheet('STICKY');
          }}
          className="p-4 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-xl bg-sky-400 text-stone-950 flex items-center justify-center mb-2 shadow-md group-hover:scale-105 transition-transform">
            <StickyNote className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-sm text-white">+ Sticky Note</span>
          <span className="text-[11px] text-stone-400">Leave reminder</span>
        </button>

        <button
          onClick={() => {
            playPinPopSound();
            setActiveSheet('POLAROID');
          }}
          className="p-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-2xl flex flex-col items-center text-center transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center mb-2 shadow-md group-hover:scale-105 transition-transform">
            <Camera className="w-6 h-6" />
          </div>
          <span className="font-extrabold text-sm text-white">+ Polaroid Photo</span>
          <span className="text-[11px] text-stone-400">Pin memory to TV</span>
        </button>
      </div>

      {/* Live Active Board Summary */}
      <div className="px-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-stone-400">
            Currently on TV Board ({state.notes.length})
          </h3>
          <span className="text-xs text-amber-400 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            Live Synced
          </span>
        </div>

        <div className="space-y-3">
          {state.notes.length === 0 ? (
            <div className="p-8 text-center bg-stone-900/60 border border-white/5 rounded-2xl text-stone-400">
              <span className="text-3xl block mb-2">📌</span>
              <p className="text-sm font-bold text-stone-300">No notes on the board yet</p>
              <p className="text-xs text-stone-500 mt-1">Tap any option above to pin something to the TV!</p>
            </div>
          ) : (
            state.notes.map((note) => {
              const itemsCount = note.items?.length || 0;
              const doneCount = note.items?.filter((i) => i.done).length || 0;

              return (
                <div
                  key={note.id}
                  onClick={() => openEditModal(note)}
                  className="p-3.5 bg-stone-900 hover:bg-stone-850 active:bg-stone-800 border border-white/10 hover:border-amber-400/40 rounded-2xl flex items-center justify-between transition-all cursor-pointer group shadow-sm"
                >
                  <div className="flex items-center space-x-3 overflow-hidden min-w-0 pr-2">
                    <span className="text-2xl shrink-0">
                      {note.type === 'GROCERY'
                        ? '🛒'
                        : note.type === 'CHORE'
                        ? '✅'
                        : note.type === 'STICKY'
                        ? '📝'
                        : '📸'}
                    </span>
                    <div className="truncate">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                          {note.title}
                        </span>
                        {note.priority && (
                          <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                              note.priority === 'HIGH'
                                ? 'bg-rose-500/20 text-rose-300'
                                : note.priority === 'MED'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-blue-500/20 text-blue-300'
                            }`}
                          >
                            {note.priority}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-400 flex items-center space-x-2 mt-0.5">
                        {note.items ? (
                          <span className="font-medium text-stone-300">
                            {doneCount}/{itemsCount} completed
                          </span>
                        ) : (
                          <span className="truncate max-w-[180px]">
                            {note.content || 'Photo memory'}
                          </span>
                        )}
                        {note.assignedToName && (
                          <span className="text-[10px] bg-stone-800 border border-white/10 px-2 py-0.5 rounded-full text-stone-300 font-bold shrink-0">
                            👤 {note.assignedToName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Edit & Delete buttons */}
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(note);
                      }}
                      className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-amber-400 border border-white/5 transition-colors cursor-pointer"
                      title="Edit note"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        promptDeleteNote(note);
                      }}
                      className="p-2 rounded-xl bg-stone-800 hover:bg-rose-900/50 text-stone-300 hover:text-rose-400 border border-white/5 transition-colors cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ------------------- ADD BOTTOM SHEETS ------------------- */}
      {activeSheet !== 'NONE' && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150">
          <div className="bg-stone-900 border-t border-white/15 rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-lg font-black text-white">
                {activeSheet === 'GROCERY' && '🛒 Add Groceries / Checklist'}
                {activeSheet === 'CHORE' && '✅ Assign Household Chore'}
                {activeSheet === 'STICKY' && '📝 Create Sticky Note'}
                {activeSheet === 'POLAROID' && '📸 Pin Polaroid Photo'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveSheet('NONE')}
                className="text-stone-400 hover:text-white text-xs font-bold px-3 py-1 bg-stone-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
            </div>

            {/* Grocery Add Form */}
            {activeSheet === 'GROCERY' && (
              <form onSubmit={handleAddGroceries} className="space-y-4">
                {groceryNotes.length > 0 && (
                  <div className="flex rounded-xl bg-stone-950 p-1 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setGroceryMode('existing')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                        groceryMode === 'existing'
                          ? 'bg-amber-400 text-stone-950 shadow-sm'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      Append to Existing List
                    </button>
                    <button
                      type="button"
                      onClick={() => setGroceryMode('new')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${
                        groceryMode === 'new'
                          ? 'bg-amber-400 text-stone-950 shadow-sm'
                          : 'text-stone-400 hover:text-white'
                      }`}
                    >
                      + Create New List
                    </button>
                  </div>
                )}

                {groceryMode === 'existing' && groceryNotes.length > 0 ? (
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                      Choose Target List
                    </label>
                    <select
                      value={targetGroceryNoteId || groceryNotes[0]?.id}
                      onChange={(e) => setTargetGroceryNoteId(e.target.value)}
                      className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none"
                    >
                      {groceryNotes.map((gn) => (
                        <option key={gn.id} value={gn.id}>
                          {gn.title} ({gn.items?.length || 0} items)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                        New List Title
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Weekly Groceries, BBQ Supplies..."
                        value={newGroceryTitle}
                        onChange={(e) => setNewGroceryTitle(e.target.value)}
                        className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                        List Color
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {AVAILABLE_COLORS.map((col) => (
                          <button
                            type="button"
                            key={col.id}
                            onClick={() => setGroceryColor(col.id)}
                            className={`h-9 rounded-xl border-2 transition-all cursor-pointer ${col.bgClass} ${
                              groceryColor === col.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'
                            }`}
                            title={col.label}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Items (one per line or comma-separated)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Almond milk&#10;Avocados&#10;Dark chocolate"
                    value={groceryInput}
                    onChange={(e) => setGroceryInput(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400 text-base"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-amber-400 hover:bg-amber-300 text-stone-950 py-3.5 rounded-xl font-black text-base shadow-lg transition-colors cursor-pointer"
                >
                  Send to Living Room TV
                </button>
              </form>
            )}

            {/* Chore Add Form */}
            {activeSheet === 'CHORE' && (
              <form onSubmit={handleAddChore} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Chore Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Mop kitchen floor"
                    value={choreTitle}
                    onChange={(e) => setChoreTitle(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Assign To
                  </label>
                  <select
                    value={choreAssignee}
                    onChange={(e) => setChoreAssignee(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none"
                  >
                    {state.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Priority
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['LOW', 'MED', 'HIGH'] as const).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setChorePriority(p)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${
                          chorePriority === p
                            ? 'bg-amber-400 text-stone-950 shadow-md font-black'
                            : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Subtasks (optional, one per line)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g., Take out trash&#10;Replace liner"
                    value={choreSubtasks}
                    onChange={(e) => setChoreSubtasks(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Card Color
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVAILABLE_COLORS.map((col) => (
                      <button
                        type="button"
                        key={col.id}
                        onClick={() => setChoreColor(col.id)}
                        className={`h-9 rounded-xl border-2 transition-all cursor-pointer ${col.bgClass} ${
                          choreColor === col.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'
                        }`}
                        title={col.label}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-orange-500 hover:bg-orange-400 text-white py-3.5 rounded-xl font-black text-base shadow-lg transition-colors cursor-pointer"
                >
                  Pin Chore to TV
                </button>
              </form>
            )}

            {/* Sticky Add Form */}
            {activeSheet === 'STICKY' && (
              <form onSubmit={handleAddSticky} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder="Reminder title..."
                    value={stickyTitle}
                    onChange={(e) => setStickyTitle(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Note Content
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Details, gate codes, or reminders..."
                    value={stickyContent}
                    onChange={(e) => setStickyContent(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Sticky Color
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVAILABLE_COLORS.map((col) => (
                      <button
                        type="button"
                        key={col.id}
                        onClick={() => setStickyColor(col.id)}
                        className={`h-10 rounded-xl border-2 transition-all cursor-pointer ${col.bgClass} ${
                          stickyColor === col.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'
                        }`}
                        title={col.label}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Magnet / Pin Style
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {AVAILABLE_MAGNETS.map((mag) => (
                      <button
                        type="button"
                        key={mag.id}
                        onClick={() => setStickyMagnet(mag.id)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center ${
                          stickyMagnet === mag.id
                            ? 'bg-amber-400/20 border-amber-400 text-white font-bold'
                            : 'bg-stone-950 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <span className="text-base mb-0.5">{mag.icon}</span>
                        <span className="text-[10px] truncate max-w-full">{mag.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-sky-400 hover:bg-sky-300 text-stone-950 py-3.5 rounded-xl font-black text-base shadow-lg transition-colors cursor-pointer"
                >
                  Pin Note to TV
                </button>
              </form>
            )}

            {/* Polaroid Add Form */}
            {activeSheet === 'POLAROID' && (
              <form onSubmit={handleAddPolaroid} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Choose Photo from Camera / Gallery
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {polaroidImage ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-48 flex items-center justify-center border border-white/20">
                      <img
                        src={polaroidImage}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-2 right-2 bg-black/80 hover:bg-black text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 cursor-pointer"
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-8 border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center text-stone-400 hover:text-white hover:border-amber-400 transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <span className="text-sm font-bold">Select or Take Photo</span>
                      <span className="text-[11px] text-stone-500">
                        Automatically compressed under 100KB
                      </span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Handwritten Caption
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Buster playing in the leaves 🍂"
                    value={polaroidCaption}
                    onChange={(e) => setPolaroidCaption(e.target.value)}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Magnet / Pin Style
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {AVAILABLE_MAGNETS.map((mag) => (
                      <button
                        type="button"
                        key={mag.id}
                        onClick={() => setPolaroidMagnet(mag.id)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center ${
                          polaroidMagnet === mag.id
                            ? 'bg-amber-400/20 border-amber-400 text-white font-bold'
                            : 'bg-stone-950 border-white/10 text-stone-400 hover:text-white'
                        }`}
                      >
                        <span className="text-base mb-0.5">{mag.icon}</span>
                        <span className="text-[10px] truncate max-w-full">{mag.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!polaroidImage}
                  className="w-full bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white py-3.5 rounded-xl font-black text-base shadow-lg transition-colors cursor-pointer"
                >
                  Snap Polaroid onto TV
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ------------------- EDIT NOTE BOTTOM SHEET ------------------- */}
      {editingNote && (
        <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xs flex flex-col justify-end animate-in fade-in duration-150">
          <div className="bg-stone-900 border-t-2 border-white/20 rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center space-x-2">
                <span className="text-xl">
                  {editingNote.type === 'GROCERY' ? '🛒' :
                   editingNote.type === 'CHORE' ? '✅' :
                   editingNote.type === 'STICKY' ? '📝' : '📸'}
                </span>
                <h3 className="text-lg font-black text-white">
                  Edit {editingNote.type === 'GROCERY' ? 'Checklist / Groceries' :
                        editingNote.type === 'CHORE' ? 'Chore' :
                        editingNote.type === 'STICKY' ? 'Sticky Note' : 'Polaroid'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRequestCloseEdit}
                className="text-stone-400 hover:text-white p-1 rounded-lg bg-stone-800 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              {/* Title Field */}
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    setIsEditDirty(true);
                  }}
                  className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400 font-bold"
                  placeholder="Note title"
                  required
                />
              </div>

              {/* STICKY Content Field */}
              {editingNote.type === 'STICKY' && (
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Note Details
                  </label>
                  <textarea
                    rows={4}
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      setIsEditDirty(true);
                    }}
                    className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400 text-sm"
                    placeholder="Details or reminders..."
                  />
                </div>
              )}

              {/* CHORE Assignee & Priority Fields */}
              {editingNote.type === 'CHORE' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                      Assigned Member
                    </label>
                    <select
                      value={editAssignee}
                      onChange={(e) => {
                        setEditAssignee(e.target.value);
                        setIsEditDirty(true);
                      }}
                      className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400"
                    >
                      {state.members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                      Priority Level
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['LOW', 'MED', 'HIGH'] as const).map((p) => (
                        <button
                          type="button"
                          key={p}
                          onClick={() => {
                            setEditPriority(p);
                            setIsEditDirty(true);
                          }}
                          className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            editPriority === p
                              ? 'bg-amber-400 text-stone-950 shadow-md font-black'
                              : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* CHECKLIST ITEMS (For GROCERY and CHORE) */}
              {(editingNote.type === 'GROCERY' || editingNote.type === 'CHORE') && (
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1.5 flex items-center justify-between">
                    <span>Checklist Items ({editItems.length})</span>
                    <span className="text-[10px] text-stone-500 font-normal">Tap item to toggle completion</span>
                  </label>

                  {/* Existing items */}
                  <div className="space-y-2 mb-3 max-h-48 overflow-y-auto pr-1">
                    {editItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          item.done
                            ? 'bg-stone-950/50 border-white/5 text-stone-500'
                            : 'bg-stone-950 border-white/15 text-stone-100'
                        }`}
                      >
                        <div
                          onClick={() => toggleEditItem(item.id)}
                          className="flex items-center space-x-2.5 flex-1 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => toggleEditItem(item.id)}
                            className="w-4 h-4 rounded text-amber-400 focus:ring-amber-400 cursor-pointer"
                          />
                          <span className={`text-sm ${item.done ? 'line-through text-stone-500' : 'font-medium'}`}>
                            {item.text}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeEditItem(item.id)}
                          className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 hover:bg-stone-850 transition-colors cursor-pointer"
                          title="Delete item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add new item row */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Add an item..."
                      value={newEditItemText}
                      onChange={(e) => setNewEditItemText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddEditItem();
                        }
                      }}
                      className="flex-1 bg-stone-950 border border-white/15 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddEditItem}
                      className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-stone-950 rounded-xl font-bold text-sm flex items-center space-x-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              )}

              {/* POLAROID Image & Caption Field */}
              {editingNote.type === 'POLAROID' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                      Photo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      ref={editFileInputRef}
                      onChange={handleEditPhotoUpload}
                      className="hidden"
                    />
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-h-48 flex items-center justify-center border border-white/20">
                      <img
                        src={editImageUrl || editingNote.imageUrl || ''}
                        alt="Photo preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="absolute bottom-2 right-2 bg-black/80 hover:bg-black text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 cursor-pointer"
                      >
                        Replace Photo
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                      Handwritten Caption
                    </label>
                    <input
                      type="text"
                      value={editContent}
                      onChange={(e) => {
                        setEditContent(e.target.value);
                        setIsEditDirty(true);
                      }}
                      className="w-full bg-stone-950 border border-white/15 rounded-xl p-3 text-white focus:outline-none focus:border-amber-400"
                      placeholder="Caption..."
                    />
                  </div>
                </>
              )}

              {/* Color Palette (STICKY, CHORE, GROCERY) */}
              {editingNote.type !== 'POLAROID' && (
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                    Card Color
                  </label>
                  <div className="grid grid-cols-6 gap-2">
                    {AVAILABLE_COLORS.map((col) => (
                      <button
                        type="button"
                        key={col.id}
                        onClick={() => {
                          setEditColor(col.id);
                          setIsEditDirty(true);
                        }}
                        className={`h-10 rounded-xl border-2 transition-all cursor-pointer ${col.bgClass} ${
                          editColor === col.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70'
                        }`}
                        title={col.label}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Magnet Style Selector */}
              <div>
                <label className="block text-xs font-bold text-stone-400 uppercase mb-1">
                  Pin / Magnet Style
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {AVAILABLE_MAGNETS.map((mag) => (
                    <button
                      type="button"
                      key={mag.id}
                      onClick={() => {
                        setEditMagnet(mag.id);
                        setIsEditDirty(true);
                      }}
                      className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center ${
                        editMagnet === mag.id
                          ? 'bg-amber-400/20 border-amber-400 text-white font-bold'
                          : 'bg-stone-950 border-white/10 text-stone-400 hover:text-white'
                      }`}
                    >
                      <span className="text-base mb-0.5">{mag.icon}</span>
                      <span className="text-[10px] truncate max-w-full">{mag.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer Actions: Delete Button, Cancel, Save Button */}
              <div className="pt-4 border-t border-white/10 flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => promptDeleteNote(editingNote)}
                  className="py-3 px-3.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                  title="Delete this pin"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs font-bold">Delete</span>
                </button>

                <button
                  type="button"
                  onClick={handleRequestCloseEdit}
                  className="flex-1 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-sm transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-stone-950 font-black text-sm shadow-lg shadow-amber-400/20 transition-all cursor-pointer text-center"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------- CONFIRMATION MODAL: DELETE NOTE ------------------- */}
      {noteToDeleteMobile && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setNoteToDeleteMobile(null)}
        >
          <div
            className="bg-stone-900 border-2 border-rose-500/80 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 text-rose-400 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Delete Pin?</h3>
            <p className="text-sm text-stone-300 mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-white">"{noteToDeleteMobile.title}"</span> from the TV board? This action will remove it for all family members.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNoteToDeleteMobile(null)}
                className="py-3 px-4 rounded-xl font-bold text-sm bg-stone-800 text-stone-300 hover:bg-stone-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMobile}
                className="py-3 px-4 rounded-xl font-black text-sm bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-900/40 transition-colors cursor-pointer"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------- CONFIRMATION MODAL: DISCARD CHANGES ------------------- */}
      {showDiscardConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setShowDiscardConfirm(false)}
        >
          <div
            className="bg-stone-900 border-2 border-amber-400/80 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 text-amber-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white mb-2">Discard Changes?</h3>
            <p className="text-sm text-stone-300 mb-6 leading-relaxed">
              You have unsaved edits to this note. Are you sure you want to discard them?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="py-3 px-4 rounded-xl font-bold text-sm bg-stone-800 text-stone-300 hover:bg-stone-700 transition-colors cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  setEditingNote(null);
                  setIsEditDirty(false);
                }}
                className="py-3 px-4 rounded-xl font-black text-sm bg-rose-600 text-white hover:bg-rose-500 shadow-lg shadow-rose-900/40 transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
