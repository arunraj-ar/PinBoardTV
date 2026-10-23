import React, { useEffect, useState } from 'react';
import {
  Settings,
  Mic,
  CheckCircle2,
  Circle,
  Sparkles,
  UserX,
  UserPlus,
  Users,
  CloudSun,
  X,
  Tv,
  Smartphone,
  ChevronDown,
  ChevronRight,
  Check,
  Home,
  Edit3,
  Trash2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { storageSync } from '../services/storageSync';
import type { HouseholdState, PinNote, HouseholdMember } from '../types/pinboard';
import {
  playPinPopSound,
  playCheckmarkSound,
  playDpadNavSound,
  playJoinSuccessSound,
} from '../services/soundEffects';
import { voiceService } from '../services/voiceService';
import { parseConversationalVoice } from '../services/voiceNlpParser';
import { NoteCard } from '../components/NoteCard';
import { organizeNotesIntoPages } from '../services/aiNoteOrganizer';
import { HouseholdNameModal } from '../components/HouseholdNameModal';

export interface TvBoardAppProps {
  onBackToScreensaver?: () => void;
}

export const TvBoardApp: React.FC<TvBoardAppProps> = ({ onBackToScreensaver }) => {
  const [state, setState] = useState<HouseholdState>(storageSync.getHouseholdState());
  const [focusArea, setFocusArea] = useState<'board' | 'header'>('board');
  const [headerFocusIndex, setHeaderFocusIndex] = useState<number>(0); // 0: Voice, 1: Settings
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const [focusedModalNote, setFocusedModalNote] = useState<PinNote | null>(null);
  const [modalFocusIndex, setModalFocusIndex] = useState<number>(0);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showNameModal, setShowNameModal] = useState<boolean>(false);
  const [settingsFocusIndex, setSettingsFocusIndex] = useState<number>(1);
  const [isQrRevealed, setIsQrRevealed] = useState<boolean>(false);
  const [isMembersExpanded, setIsMembersExpanded] = useState<boolean>(false);
  const [memberToConfirmRemove, setMemberToConfirmRemove] = useState<HouseholdMember | null>(null);
  const [confirmDialogFocusIndex, setConfirmDialogFocusIndex] = useState<number>(0); // 0: Cancel, 1: Confirm Remove
  const [noteToDelete, setNoteToDelete] = useState<PinNote | null>(null);
  const [deleteConfirmFocusIndex, setDeleteConfirmFocusIndex] = useState<number>(0); // 0: Cancel, 1: Confirm Delete
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [voiceStatusText, setVoiceStatusText] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
      );
      setDateStr(
        now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Voice Status Toast Auto-Dismiss
  useEffect(() => {
    if (!isListening && (voiceStatusText || voiceTranscript)) {
      const timer = setTimeout(() => {
        setVoiceStatusText('');
        setVoiceTranscript('');
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [isListening, voiceStatusText, voiceTranscript]);

  // Sync subscription
  useEffect(() => {
    const unsubscribe = storageSync.subscribe((newState) => {
      setState(newState);
      if (focusedModalNote) {
        const updated = newState.notes.find((n) => n.id === focusedModalNote.id);
        if (updated) setFocusedModalNote(updated);
      }
      if (noteToDelete) {
        const stillExists = newState.notes.some((n) => n.id === noteToDelete.id);
        if (!stillExists) setNoteToDelete(null);
      }
    });
    return unsubscribe;
  }, [focusedModalNote, noteToDelete]);

  // AI Heterogeneous Pagination & Dynamic Layout:
  // <= 8 items on a single page: 4 cols x 2 rows (spacious)
  // 9 to 15 items per page: 5 cols x 3 rows (compact 10-foot legible)
  // 15+ items: Horizontal sliding multi-page carousel with seamless D-pad boundaries
  const uniqueNotes = Array.from(new Map(state.notes.map((n) => [n.id, n])).values());
  const pages = organizeNotesIntoPages(uniqueNotes, 15);
  const totalPages = Math.max(1, pages.length);
  const cols = totalPages > 1 || uniqueNotes.length > 8 ? 5 : 4;
  const isCompact = cols === 5;
  const currentNotes = pages[currentPage] || [];

  // Clamp current page if total pages decreased
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  // If notes become empty, shift focus to header settings/voice
  useEffect(() => {
    if (uniqueNotes.length === 0 && focusArea === 'board') {
      setFocusArea('header');
      setHeaderFocusIndex(1); // focus on Settings
    }
  }, [uniqueNotes.length, focusArea]);

  // Idle Screensaver Inactivity Timeout (30 seconds)
  useEffect(() => {
    if (!onBackToScreensaver) return;
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isListening && !showSettings && !focusedModalNote && !noteToDelete) {
          onBackToScreensaver();
        }
      }, 30000);
    };

    resetTimer();
    const events = ['keydown', 'mousemove', 'mousedown', 'touchstart'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [onBackToScreensaver, isListening, showSettings, focusedModalNote, noteToDelete]);

  // Dynamic list of focusable items inside Settings Side Panel
  const getSettingsFocusList = () => {
    const list: {
      id: string;
      type: 'close' | 'household_name' | 'ai_organize' | 'theme' | 'members_header' | 'add_member' | 'remove_member' | 'done';
      memberId?: string;
    }[] = [
      { id: 'close', type: 'close' },
      { id: 'household_name', type: 'household_name' },
      { id: 'ai_organize', type: 'ai_organize' },
      { id: 'theme', type: 'theme' },
      { id: 'members_header', type: 'members_header' },
    ];

    if (isMembersExpanded) {
      list.push({ id: 'add_member', type: 'add_member' });
      state.members.forEach((m) => {
        if (m.role !== 'HOST') {
          list.push({ id: `member_${m.id}`, type: 'remove_member', memberId: m.id });
        }
      });
    }

    list.push({ id: 'done', type: 'done' });

    return list;
  };

  const openSettings = () => {
    playPinPopSound();
    setShowSettings(true);
    setIsQrRevealed(false);
    setIsMembersExpanded(false);
    setMemberToConfirmRemove(null);
    setSettingsFocusIndex(1); // focus on AI Organize by default
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If Household Name Modal is open, delegate all keys to modal
      if (showNameModal) {
        return;
      }

      // 0a. Note Deletion Confirmation Dialog D-Pad Navigation
      if (noteToDelete) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
          e.preventDefault();
          playPinPopSound();
          setNoteToDelete(null);
          return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          playDpadNavSound();
          setDeleteConfirmFocusIndex(0);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          setDeleteConfirmFocusIndex(1);
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          if (deleteConfirmFocusIndex === 0) {
            playPinPopSound();
            setNoteToDelete(null);
          } else {
            playPinPopSound();
            storageSync.deleteNote(noteToDelete.id);
            setNoteToDelete(null);
            setFocusedModalNote(null);
            setFocusedIndex((prev) => Math.max(0, Math.min(prev, currentNotes.length - 2)));
          }
        }
        return;
      }

      // 0b. Member Removal Confirmation Dialog D-Pad Navigation
      if (memberToConfirmRemove) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
          e.preventDefault();
          playPinPopSound();
          setMemberToConfirmRemove(null);
          return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          playDpadNavSound();
          setConfirmDialogFocusIndex(0);
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          setConfirmDialogFocusIndex(1);
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          if (confirmDialogFocusIndex === 0) {
            playPinPopSound();
            setMemberToConfirmRemove(null);
          } else {
            playPinPopSound();
            storageSync.removeMember(memberToConfirmRemove.id);
            setMemberToConfirmRemove(null);
            setSettingsFocusIndex((prev) => Math.max(0, prev - 1));
          }
        }
        return;
      }

      // 1. Voice listening Escape
      if (isListening && (e.key === 'Escape' || e.keyCode === 27)) {
        e.preventDefault();
        voiceService.stopListening();
        setIsListening(false);
        setVoiceStatusText('');
        return;
      }

      // 2. Settings Side Panel D-Pad Navigation
      if (showSettings) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
          e.preventDefault();
          playPinPopSound();
          setShowSettings(false);
          return;
        }

        const focusList = getSettingsFocusList();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          setSettingsFocusIndex((prev) => Math.min(prev + 1, focusList.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          playDpadNavSound();
          setSettingsFocusIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          const target = focusList[Math.min(settingsFocusIndex, focusList.length - 1)];
          if (!target) return;

          if (target.type === 'close' || target.type === 'done') {
            playPinPopSound();
            setShowSettings(false);
          } else if (target.type === 'household_name') {
            playPinPopSound();
            setShowNameModal(true);
          } else if (target.type === 'ai_organize') {
            playPinPopSound();
            storageSync.toggleAutonomousAiOrganize();
          } else if (target.type === 'theme') {
            playPinPopSound();
            storageSync.setTheme(state.theme === 'cork' ? 'slate' : 'cork');
          } else if (target.type === 'members_header') {
            playPinPopSound();
            setIsMembersExpanded((prev) => !prev);
          } else if (target.type === 'add_member') {
            playJoinSuccessSound();
            storageSync.rotateOtp(); // automatic rotation!
            setIsQrRevealed(true);
          } else if (target.type === 'remove_member' && target.memberId) {
            playPinPopSound();
            const memberObj = state.members.find((m) => m.id === target.memberId);
            if (memberObj) {
              setMemberToConfirmRemove(memberObj);
              setConfirmDialogFocusIndex(0);
            }
          }
        }
        return;
      }

      // 3. 10-Foot Focus Modal D-Pad Navigation
      if (focusedModalNote) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
          e.preventDefault();
          playPinPopSound();
          setFocusedModalNote(null);
          return;
        }

        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          triggerVoiceInput(focusedModalNote);
          return;
        }

        if (e.key === 'Delete' || e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          playPinPopSound();
          setNoteToDelete(focusedModalNote);
          setDeleteConfirmFocusIndex(0);
          return;
        }

        const itemsCount = focusedModalNote.items?.length || 0;
        // Focus indexing:
        // 0: [X] Close button in top-right header
        // 1..itemsCount: Checklist items (if any)
        // itemsCount + 1: Delete Note button
        // itemsCount + 2: Voice Edit button
        // itemsCount + 3: Done button
        const deleteBtnIndex = itemsCount + 1;
        const voiceBtnIndex = itemsCount + 2;
        const doneBtnIndex = itemsCount + 3;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          if (modalFocusIndex === 0) {
            setModalFocusIndex(itemsCount > 0 ? 1 : deleteBtnIndex);
          } else if (modalFocusIndex <= itemsCount) {
            setModalFocusIndex(modalFocusIndex === itemsCount ? deleteBtnIndex : modalFocusIndex + 1);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          playDpadNavSound();
          if (modalFocusIndex === 0) {
            // Already at top-most close button
            return;
          } else if (modalFocusIndex === 1) {
            setModalFocusIndex(0);
          } else if (modalFocusIndex >= deleteBtnIndex) {
            setModalFocusIndex(itemsCount > 0 ? itemsCount : 0);
          } else {
            setModalFocusIndex(modalFocusIndex - 1);
          }
        } else if (e.key === 'ArrowRight') {
          if (modalFocusIndex >= deleteBtnIndex) {
            e.preventDefault();
            playDpadNavSound();
            if (modalFocusIndex === deleteBtnIndex) setModalFocusIndex(voiceBtnIndex);
            else if (modalFocusIndex === voiceBtnIndex) setModalFocusIndex(doneBtnIndex);
          }
        } else if (e.key === 'ArrowLeft') {
          if (modalFocusIndex >= deleteBtnIndex) {
            e.preventDefault();
            playDpadNavSound();
            if (modalFocusIndex === doneBtnIndex) setModalFocusIndex(voiceBtnIndex);
            else if (modalFocusIndex === voiceBtnIndex) setModalFocusIndex(deleteBtnIndex);
          }
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          if (modalFocusIndex === 0) {
            // [X] Close Button
            playPinPopSound();
            setFocusedModalNote(null);
          } else if (itemsCount > 0 && modalFocusIndex >= 1 && modalFocusIndex <= itemsCount) {
            // Toggle the focused checklist item
            const targetItem = focusedModalNote.items![modalFocusIndex - 1];
            const newDone = storageSync.toggleChecklistItem(focusedModalNote.id, targetItem.id);
            playCheckmarkSound(newDone);
            if (newDone) {
              confetti({ particleCount: 40, spread: 65, origin: { y: 0.6 } });
            }
          } else if (modalFocusIndex === deleteBtnIndex) {
            // Delete Note Button -> open confirmation
            playPinPopSound();
            setNoteToDelete(focusedModalNote);
            setDeleteConfirmFocusIndex(0);
          } else if (modalFocusIndex === voiceBtnIndex) {
            // Voice Edit Button
            triggerVoiceInput(focusedModalNote);
          } else if (modalFocusIndex === doneBtnIndex) {
            // Done Button
            playPinPopSound();
            setFocusedModalNote(null);
          }
        }
        return;
      }

      // 4. Board & Header Navigation
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        openSettings();
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        triggerVoiceInput(null);
        return;
      }

      if (focusArea === 'header') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          playDpadNavSound();
          setHeaderFocusIndex(0);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          playDpadNavSound();
          setHeaderFocusIndex(1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          playDpadNavSound();
          setFocusArea('board');
          // Spatial drop from header into board: Voice Pin drops into mid-left column, Settings drops into right column
          if (currentNotes.length > 0) {
            const targetCol = headerFocusIndex === 0 ? Math.min(cols > 4 ? 3 : 2, currentNotes.length - 1) : Math.min(cols - 1, currentNotes.length - 1);
            setFocusedIndex(targetCol);
          }
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
          e.preventDefault();
          if (headerFocusIndex === 0) {
            triggerVoiceInput(null);
          } else {
            openSettings();
          }
        }
        return;
      }

      // focusArea === 'board'
      const col = focusedIndex % cols;
      const row = Math.floor(focusedIndex / cols);

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (col === cols - 1 || focusedIndex === currentNotes.length - 1) {
          // At right boundary of current page: seamless slide to next page
          if (currentPage < totalPages - 1) {
            playDpadNavSound();
            const nextPageNotes = pages[currentPage + 1] || [];
            const targetIndex = Math.min(row * cols, Math.max(0, nextPageNotes.length - 1));
            setCurrentPage((p) => p + 1);
            setFocusedIndex(targetIndex);
          }
        } else {
          playDpadNavSound();
          setFocusedIndex((prev) => Math.min(prev + 1, currentNotes.length - 1));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (col === 0) {
          // At left boundary of current page: seamless slide to previous page
          if (currentPage > 0) {
            playDpadNavSound();
            const prevPageNotes = pages[currentPage - 1] || [];
            const targetIndex = Math.min(row * cols + (cols - 1), Math.max(0, prevPageNotes.length - 1));
            setCurrentPage((p) => p - 1);
            setFocusedIndex(targetIndex);
          }
        } else {
          playDpadNavSound();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        playDpadNavSound();
        const nextIndex = focusedIndex + cols;
        if (nextIndex < currentNotes.length) {
          setFocusedIndex(nextIndex);
        } else {
          const lastRow = Math.floor((currentNotes.length - 1) / cols);
          if (row < lastRow) {
            setFocusedIndex(currentNotes.length - 1);
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        playDpadNavSound();
        if (focusedIndex < cols) {
          // Move from top row into header buttons: col < half -> Voice Pin (0), right half -> Settings (1)
          setFocusArea('header');
          setHeaderFocusIndex(col < Math.ceil(cols / 2) ? 0 : 1);
        } else {
          setFocusedIndex((prev) => Math.max(prev - cols, 0));
        }
      } else if (e.key === 'PageDown' || e.key === ']' || e.key === 'ChannelDown') {
        if (currentPage < totalPages - 1) {
          e.preventDefault();
          playDpadNavSound();
          setCurrentPage((p) => p + 1);
          setFocusedIndex(0);
        }
      } else if (e.key === 'PageUp' || e.key === '[' || e.key === 'ChannelUp') {
        if (currentPage > 0) {
          e.preventDefault();
          playDpadNavSound();
          setCurrentPage((p) => p - 1);
          setFocusedIndex(0);
        }
      } else if (e.key === 'Delete' || e.key === 'd' || e.key === 'D') {
        const activeCard = currentNotes[focusedIndex];
        if (activeCard) {
          e.preventDefault();
          playPinPopSound();
          setNoteToDelete(activeCard);
          setDeleteConfirmFocusIndex(0);
        }
      } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 13) {
        e.preventDefault();
        const activeCard = currentNotes[focusedIndex];
        if (activeCard) {
          playPinPopSound();
          setFocusedModalNote(activeCard);
          setModalFocusIndex(activeCard.items && activeCard.items.length > 0 ? 1 : 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentNotes,
    pages,
    currentPage,
    totalPages,
    cols,
    focusedIndex,
    focusedModalNote,
    modalFocusIndex,
    isListening,
    showSettings,
    showNameModal,
    settingsFocusIndex,
    focusArea,
    headerFocusIndex,
    state.theme,
    isMembersExpanded,
    isQrRevealed,
    state.members,
    memberToConfirmRemove,
    confirmDialogFocusIndex,
    noteToDelete,
    deleteConfirmFocusIndex,
  ]);

  // Universal Auto-scroll for TV D-Pad navigation: works everywhere (modal checklist, settings list, etc.)
  useEffect(() => {
    const focusedElements = document.querySelectorAll('[data-focused="true"]');
    focusedElements.forEach((el) => {
      const scrollableParent = el.closest('.overflow-y-auto');
      if (scrollableParent) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
  }, [
    modalFocusIndex,
    settingsFocusIndex,
    focusedIndex,
    currentPage,
    focusedModalNote,
    showSettings,
    isMembersExpanded,
    focusArea,
    headerFocusIndex,
    confirmDialogFocusIndex,
    noteToDelete,
    deleteConfirmFocusIndex,
  ]);

  // Voice Input & Context-Aware Conversational Parsing
  const triggerVoiceInput = (targetNote: PinNote | null) => {
    playPinPopSound();
    setVoiceTranscript('');
    setVoiceStatusText(
      targetNote
        ? `Listening for changes to "${targetNote.title}"...`
        : 'Listening for new note or grocery item...'
    );
    setIsListening(true);

    const availableNames = state.members.map((m) => m.name.split(' ')[0]);

    const executeParsedVoiceAction = (parsed: any, target: PinNote | null) => {
      setVoiceStatusText(parsed.summary);

      if (parsed.action === 'SET_HOUSEHOLD_NAME' && parsed.newHouseholdName) {
        storageSync.setHouseholdName(parsed.newHouseholdName);
        playJoinSuccessSound();
        confetti({ particleCount: 45, spread: 70, origin: { y: 0.6 } });
      } else if (parsed.action === 'EDIT_CONTENT' && target) {
        storageSync.updateNote(target.id, {
          content: parsed.newContent,
          title: parsed.newTitle || target.title,
        });
        playJoinSuccessSound();
      } else if (parsed.action === 'APPEND_CHECKLIST' && parsed.checklistItems) {
        const targetId = parsed.noteId || target?.id;
        if (targetId) {
          parsed.checklistItems.forEach((itemText: string) => {
            storageSync.addChecklistItem(targetId, itemText, 'General', 'Voice');
          });
          playJoinSuccessSound();
          confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
        }
      } else if (parsed.action === 'TOGGLE_ITEM' && target && parsed.toggleItemText) {
        const newDone = storageSync.toggleChecklistItem(target.id, parsed.toggleItemText);
        playCheckmarkSound(newDone);
      } else if (parsed.action === 'REASSIGN' && target && parsed.assignedToName) {
        const matchedMember = state.members.find((m) =>
          m.name.toLowerCase().includes(parsed.assignedToName!.toLowerCase())
        );
        storageSync.updateNote(target.id, {
          assignedToName: parsed.assignedToName,
          assignedToMemberId: matchedMember?.id,
        });
        playJoinSuccessSound();
      } else if (parsed.action === 'CREATE_NOTE' && parsed.newNote) {
        // If it's a grocery note and we already have a grocery list, append instead of duplicate!
        if (parsed.newNote.type === 'GROCERY') {
          const existingGrocery = state.notes.find((n) => n.type === 'GROCERY');
          if (existingGrocery) {
            parsed.newNote.items?.forEach((itemText: string) => {
              storageSync.addChecklistItem(existingGrocery.id, itemText, 'General', 'Voice');
            });
            playJoinSuccessSound();
            confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
            return;
          }
        }

        storageSync.addNote({
          type: parsed.newNote.type,
          title: parsed.newNote.title,
          content: parsed.newNote.content,
          color: parsed.newNote.type === 'GROCERY' ? 'green' : parsed.newNote.type === 'CHORE' ? 'orange' : 'yellow',
          magnet: 'red-dot',
          rotationDeg: Math.random() * 3 - 1.5,
          assignedToName: parsed.newNote.assignedToName,
          priority: parsed.newNote.priority || 'MED',
          pinned: true,
          createdByMemberId: 'voice_remote',
          items: parsed.newNote.items
            ? parsed.newNote.items.map((it: string, idx: number) => ({
                id: `it_${Date.now()}_${idx}`,
                text: it,
                done: false,
              }))
            : undefined,
        });
        playJoinSuccessSound();
        confetti({ particleCount: 45, spread: 65, origin: { y: 0.6 } });
      }
    };

    const success = voiceService.startListening(
      (transcript) => {
        setIsListening(false);
        setVoiceTranscript(transcript);
        const parsed = parseConversationalVoice(transcript, targetNote, availableNames, state.notes);
        executeParsedVoiceAction(parsed, targetNote);
      },
      (error) => {
        setIsListening(false);
        setVoiceStatusText(`Microphone: ${error}`);
      },
      () => {
        setIsListening(false);
      }
    );

    if (!success) {
      setIsListening(false);
      const simulated = prompt(
        targetNote
          ? `[Voice Remote Simulation] Speak your change to "${targetNote.title}":\n(e.g., "Edit this to: Pick up Grandma at 3pm", "Add organic oat milk", "Assign to Alex")`
          : '[Voice Remote Simulation] Speak your command:\n(e.g., "Add oat milk to groceries", "Rename household to The Cozy Cottage", "Remind Alex to take out trash")'
      );
      if (simulated) {
        setVoiceTranscript(simulated);
        const parsed = parseConversationalVoice(simulated, targetNote, availableNames, state.notes);
        executeParsedVoiceAction(parsed, targetNote);
      }
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pinboard.tv';
  const magicQrUrl = `${origin}/join?hh=${state.householdId}&code=${state.currentOtp}`;

  return (
    <div
      className={`relative w-screen h-screen overflow-hidden select-none animate-pixel-shift flex flex-col justify-between ${
        state.theme === 'slate' ? 'slateboard-canvas' : 'corkboard-canvas'
      } vignette-overlay`}
    >
      {/* Top Title Bar (Avoided on Screensaver) */}
      <header className="px-10 pt-6 pb-3 flex items-center justify-between bg-gradient-to-b from-black/60 via-black/20 to-transparent shrink-0 z-20">
        {/* Left: Household Name + Weather + Clock */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">📌</span>
            <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
              {state.householdName}
            </h1>
          </div>

          <button
            onClick={() => {
              playPinPopSound();
              if (onBackToScreensaver) onBackToScreensaver();
            }}
            className="flex items-center space-x-3 text-stone-300 text-lg font-bold pl-6 border-l border-white/20 hover:text-white transition-colors cursor-pointer"
            title="Switch to Ambient Screensaver"
          >
            <span className="text-amber-300 font-black">{timeStr}</span>
            <span>•</span>
            <span>{dateStr}</span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-amber-200">
              <CloudSun className="w-5 h-5 text-amber-300" />
              72°F
            </span>
          </button>
        </div>

        {/* Right Controls: Voice Pin & Settings */}
        <div className="flex items-center space-x-3">
          {/* Voice Pin Button */}
          <button
            onClick={() => triggerVoiceInput(null)}
            data-focused={focusArea === 'header' && headerFocusIndex === 0}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer border-2 ${
              focusArea === 'header' && headerFocusIndex === 0
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                : isListening
                ? 'bg-purple-600 text-white ring-4 ring-purple-400 animate-pulse border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.4)]'
                : 'bg-stone-900/90 hover:bg-stone-800 text-stone-200 border-white/20'
            }`}
            title="Press to speak a new pin"
          >
            <Mic
              className={`w-4 h-4 ${
                focusArea === 'header' && headerFocusIndex === 0
                  ? 'text-stone-950'
                  : isListening
                  ? 'text-white'
                  : 'text-amber-400'
              }`}
            />
            <span>{isListening ? 'Listening...' : 'Voice Pin'}</span>
          </button>

          {/* Settings Button */}
          <button
            onClick={openSettings}
            data-focused={focusArea === 'header' && headerFocusIndex === 1}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer border-2 ${
              focusArea === 'header' && headerFocusIndex === 1
                ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                : 'bg-stone-900/90 text-stone-200 hover:text-white hover:bg-stone-800 border-white/20'
            }`}
            title="Household Settings"
          >
            <Settings
              className={`w-4 h-4 ${
                focusArea === 'header' && headerFocusIndex === 1
                  ? 'text-stone-950'
                  : 'text-amber-400'
              }`}
            />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Voice Status Toast with Auto-Dismiss & Close */}
      {(voiceStatusText || voiceTranscript) && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-purple-950/95 border-2 border-purple-400 text-purple-100 px-6 py-2.5 rounded-full text-base font-black shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <Sparkles className="w-5 h-5 text-purple-300 animate-spin" />
          <span>{voiceStatusText || `"${voiceTranscript}"`}</span>
          <button
            onClick={() => {
              setVoiceStatusText('');
              setVoiceTranscript('');
            }}
            className="ml-2 text-purple-300 hover:text-white cursor-pointer p-0.5 rounded-full hover:bg-purple-800/50"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 16:9 Full Widescreen Canvas: Horizontal Slide Carousel (15 items per page) */}
      <main className="flex-1 pb-4 pt-2 px-2 flex flex-col justify-center w-full overflow-hidden relative">
        {uniqueNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-10 max-w-2xl mx-auto bg-stone-900/80 backdrop-blur-md rounded-3xl border border-white/15 shadow-2xl space-y-6">
            <div className="w-20 h-20 rounded-full bg-amber-400/20 border-2 border-amber-400/50 flex items-center justify-center text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.3)]">
              <Sparkles className="w-10 h-10 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white tracking-wide">Your PinBoard is Ready!</h2>
              <p className="text-stone-300 text-lg">
                Start adding notes, groceries, chores, or photos to see them appear live on this screen.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-left pt-2 w-full">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start space-x-3">
                <Smartphone className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white text-base">Mobile Companion</div>
                  <div className="text-stone-400 text-sm">Open Settings on this TV to scan the QR code with your phone.</div>
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start space-x-3">
                <Mic className="w-6 h-6 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white text-base">Alexa Voice</div>
                  <div className="text-stone-400 text-sm">Say &ldquo;Alexa, ask Pin Board to add milk to groceries&rdquo; or click Voice Pin above.</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="flex transition-transform duration-500 ease-out h-[81vh] w-full"
            style={{ transform: `translateX(-${currentPage * 100}%)` }}
          >
            {pages.map((pageNotes, pIdx) => (
              <div
                key={`board_page_${pIdx}`}
                className="w-full h-full shrink-0 px-10 py-2.5 grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${cols === 5 ? 3 : 2}, minmax(0, 1fr))`,
                }}
              >
                {pageNotes.map((note, nIdx) => {
                  const isFocused = focusArea === 'board' && currentPage === pIdx && nIdx === focusedIndex;
                  return (
                    <NoteCard
                      key={note.id}
                      note={note}
                      density={isCompact ? 'compact' : 'spacious'}
                      isFocused={isFocused}
                      onClick={() => {
                        playPinPopSound();
                        setFocusArea('board');
                        setCurrentPage(pIdx);
                        setFocusedIndex(nIdx);
                        setFocusedModalNote(note);
                        setModalFocusIndex(0);
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Page Indicator Pill */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center space-x-3 pt-2 shrink-0 z-20">
            <div className="bg-black/60 backdrop-blur-md px-5 py-1.5 rounded-full border border-white/20 flex items-center space-x-3 text-stone-200 text-sm font-black shadow-lg">
              <span className="text-amber-300">
                Page {currentPage + 1} of {totalPages}
              </span>
              <div className="flex items-center space-x-1.5 pl-1 border-l border-white/20">
                {pages.map((_, dotIdx) => (
                  <button
                    key={dotIdx}
                    onClick={() => {
                      playPinPopSound();
                      setCurrentPage(dotIdx);
                      setFocusedIndex(0);
                    }}
                    className={`rounded-full transition-all cursor-pointer ${
                      dotIdx === currentPage
                        ? 'w-6 h-2.5 bg-amber-400 ring-2 ring-amber-300'
                        : 'w-2.5 h-2.5 bg-white/30 hover:bg-white/60'
                    }`}
                    title={`Jump to Page ${dotIdx + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 10-FOOT FOCUS MODAL: 100% D-Pad Navigable & True 10-Foot UI Scale */}
      {focusedModalNote && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in zoom-in-95 duration-150">
          <div
            className={`w-full max-w-4xl max-h-[88vh] flex flex-col justify-between rounded-3xl p-10 shadow-2xl border-4 relative text-left ${
              focusedModalNote.type === 'POLAROID'
                ? 'bg-white text-stone-900 border-white/80'
                : focusedModalNote.color === 'yellow'
                ? 'bg-amber-100 text-amber-950 border-amber-300'
                : focusedModalNote.color === 'pink'
                ? 'bg-rose-100 text-rose-950 border-rose-300'
                : focusedModalNote.color === 'blue'
                ? 'bg-sky-100 text-sky-950 border-sky-300'
                : focusedModalNote.color === 'green'
                ? 'bg-lime-100 text-lime-950 border-lime-300'
                : 'bg-orange-100 text-orange-950 border-orange-300'
            }`}
          >
            {/* Header: Category Badge & D-Pad Navigable Close Button */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-base uppercase font-black tracking-wider text-black/70">
                  {focusedModalNote.type === 'GROCERY'
                    ? 'Grocery Checklist'
                    : focusedModalNote.type === 'CHORE'
                    ? 'Household Chore'
                    : focusedModalNote.type === 'STICKY'
                    ? 'Family Sticky Reminder'
                    : 'Polaroid Memory'}
                </span>

                <button
                  onClick={() => {
                    playPinPopSound();
                    setFocusedModalNote(null);
                  }}
                  data-focused={modalFocusIndex === 0}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer border-2 ${
                    modalFocusIndex === 0
                      ? 'ring-4 ring-amber-500 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)]'
                      : 'bg-black/10 text-stone-800 hover:bg-black/20 border-black/10'
                  }`}
                  title="Close Note (or press Back)"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* 10-Foot Modal Title */}
              <h2 className="text-4xl font-black tracking-tight leading-tight mb-4 border-b border-black/15 pb-3">
                {focusedModalNote.title}
              </h2>
            </div>

            {/* Scrollable Center Content */}
            <div className="flex-1 overflow-y-auto px-4 py-2 my-2 space-y-4">
              {/* Polaroid Large Photo View */}
              {focusedModalNote.type === 'POLAROID' && (
                <div className="mb-4">
                  <div className="w-full h-96 rounded-2xl overflow-hidden bg-stone-100 border border-stone-200 shadow-inner">
                    <img
                      src={focusedModalNote.imageUrl}
                      alt={focusedModalNote.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="font-handwriting text-4xl text-stone-800 text-center mt-4">
                    {focusedModalNote.content || focusedModalNote.title}
                  </p>
                </div>
              )}

              {/* Sticky Note Content */}
              {focusedModalNote.content && focusedModalNote.type !== 'POLAROID' && (
                <p className="text-3xl leading-relaxed font-sans whitespace-pre-wrap text-stone-900 font-medium">
                  {focusedModalNote.content}
                </p>
              )}

              {/* Checklist Items: D-Pad Selectable with clear active focus highlight */}
              {focusedModalNote.items && (
                <div className="space-y-3">
                  {focusedModalNote.items.map((item, idx) => {
                    const isItemFocused = modalFocusIndex === idx + 1;
                    return (
                      <div
                        key={item.id}
                        data-focused={isItemFocused}
                        onClick={() => {
                          const newDone = storageSync.toggleChecklistItem(
                            focusedModalNote.id,
                            item.id
                          );
                          playCheckmarkSound(newDone);
                          if (newDone) {
                            confetti({ particleCount: 35, spread: 60, origin: { y: 0.6 } });
                          }
                        }}
                        className={`flex items-center space-x-5 p-4 rounded-2xl transition-all cursor-pointer text-2xl font-black border-2 ${
                          isItemFocused
                            ? 'ring-4 ring-amber-500 border-amber-500 bg-amber-400/35 text-stone-950 shadow-lg'
                            : 'bg-black/5 hover:bg-black/10 border-transparent text-stone-900'
                        }`}
                      >
                        {item.done ? (
                          <CheckCircle2 className="w-10 h-10 text-emerald-700 fill-emerald-100 shrink-0" />
                        ) : (
                          <Circle
                            className={`w-10 h-10 shrink-0 ${
                              isItemFocused ? 'text-stone-800' : 'text-stone-400'
                            }`}
                          />
                        )}
                        <span
                          className={`flex-1 ${
                            item.done ? 'line-through opacity-45 font-medium' : 'font-black'
                          }`}
                        >
                          {item.text}
                        </span>
                        {item.category && (
                          <span className="text-sm bg-black/15 px-3 py-1 rounded-full font-black text-black/75">
                            {item.category}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom HUD: Uniform Buttons & Clear Focus Highlight */}
            <div className="pt-4 border-t border-black/15 flex items-center justify-between shrink-0">
              {/* Optional Assigned Member */}
              <div>
                {focusedModalNote.assignedToName ? (
                  <span className="text-sm font-bold bg-black/10 text-stone-800 px-3.5 py-1.5 rounded-full">
                    👤 Assigned to {focusedModalNote.assignedToName}
                  </span>
                ) : (
                  <div />
                )}
              </div>

              {/* Uniform Action Buttons */}
              <div className="flex items-center space-x-3">
                {/* Delete Note Button */}
                {(() => {
                  const itemsCount = focusedModalNote.items?.length || 0;
                  const isDeleteFocused = modalFocusIndex === itemsCount + 1;
                  return (
                    <button
                      onClick={() => {
                        playPinPopSound();
                        setNoteToDelete(focusedModalNote);
                        setDeleteConfirmFocusIndex(0);
                      }}
                      data-focused={isDeleteFocused}
                      className={`flex items-center justify-center space-x-2 px-5 py-3 rounded-xl font-bold text-base transition-all cursor-pointer whitespace-nowrap min-w-[130px] border-2 ${
                        isDeleteFocused
                          ? 'ring-4 ring-rose-500 border-rose-400 bg-rose-600 text-white font-black shadow-[0_0_20px_rgba(244,63,94,0.5)]'
                          : 'bg-rose-950/20 hover:bg-rose-900/40 text-rose-700 hover:text-rose-900 border-rose-500/30'
                      }`}
                      title="Delete this note"
                    >
                      <Trash2 className="w-5 h-5 shrink-0 text-current" />
                      <span>Delete Note</span>
                    </button>
                  );
                })()}

                {/* Voice Edit Button */}
                {(() => {
                  const itemsCount = focusedModalNote.items?.length || 0;
                  const isVoiceFocused = modalFocusIndex === itemsCount + 2;
                  return (
                    <button
                      onClick={() => triggerVoiceInput(focusedModalNote)}
                      data-focused={isVoiceFocused}
                      className={`flex items-center justify-center space-x-2 px-5 py-3 rounded-xl font-bold text-base transition-all cursor-pointer whitespace-nowrap min-w-[130px] border-2 ${
                        isVoiceFocused
                          ? 'ring-4 ring-amber-500 border-amber-300 bg-amber-400 text-stone-950 font-black shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                          : isListening
                          ? 'bg-purple-600 text-white ring-4 ring-purple-400 border-purple-400 animate-pulse'
                          : 'bg-black/10 hover:bg-black/20 text-stone-900 border-black/10'
                      }`}
                    >
                      <Mic className="w-5 h-5 shrink-0 text-current" />
                      <span>{isListening ? 'Listening...' : 'Voice Edit'}</span>
                    </button>
                  );
                })()}

                {/* Done Action Button */}
                {(() => {
                  const itemsCount = focusedModalNote.items?.length || 0;
                  const isDoneFocused = modalFocusIndex === itemsCount + 3;
                  return (
                    <button
                      onClick={() => {
                        playPinPopSound();
                        setFocusedModalNote(null);
                      }}
                      data-focused={isDoneFocused}
                      className={`flex items-center justify-center space-x-2 px-5 py-3 rounded-xl font-bold text-base transition-all cursor-pointer whitespace-nowrap min-w-[130px] border-2 ${
                        isDoneFocused
                          ? 'ring-4 ring-amber-500 border-amber-300 bg-amber-400 text-stone-950 font-black shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                          : 'bg-black/10 hover:bg-black/20 text-stone-900 border-black/10'
                      }`}
                    >
                      <Check className="w-5 h-5 shrink-0 text-current" />
                      <span>Done</span>
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS SIDE PANEL WITH GIANT 50%+ MAGIC QR CODE IN CENTER STAGE */}
      {showSettings && (() => {
        const focusList = getSettingsFocusList();
        const currentFocusItem = focusList[Math.min(settingsFocusIndex, focusList.length - 1)];

        return (
          <div className="fixed inset-0 z-50 bg-black/92 backdrop-blur-xl flex flex-row animate-in fade-in duration-200">
            {/* CENTER STAGE: Giant QR Code (covers 55%+ of TV screen!) */}
            {!isQrRevealed ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center select-none animate-in fade-in duration-200">
                <div className="max-w-xl flex flex-col items-center">
                  <div className="w-24 h-24 rounded-3xl bg-stone-900 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
                    <Home className="w-12 h-12 text-amber-400" />
                  </div>
                  <h2 className="text-4xl font-black text-white tracking-tight mb-3">
                    {state.householdName}
                  </h2>
                  <p className="text-lg text-stone-300 font-medium leading-relaxed mb-6">
                    Manage your household settings, change display preferences, or add family members using the menu on the right.
                  </p>
                  <div className="inline-flex items-center space-x-2 text-stone-400 text-sm bg-stone-900/80 px-5 py-2.5 rounded-2xl border border-white/10 shadow-lg">
                    <span>To connect a phone, select</span>
                    <span className="text-amber-400 font-bold">"+ Add Family Member"</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="max-w-xl flex flex-col items-center">
                  <h2 className="text-4xl font-black text-white tracking-tight mb-8">
                    Scan to Connect Phone
                  </h2>

                  {/* Giant QR Code Container */}
                  <div className="bg-white p-6 rounded-3xl shadow-[0_0_80px_rgba(245,158,11,0.35)] border-4 border-amber-400 mb-6">
                    <QRCodeSVG value={magicQrUrl} size={340} level="M" />
                  </div>

                  {/* Large Passkey Display */}
                  <div className="text-6xl font-mono font-black text-amber-400 tracking-widest drop-shadow-md">
                    {state.currentOtp.slice(0, 3)} - {state.currentOtp.slice(3)}
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT SIDE PANEL: 100% D-Pad Navigable 10-Foot Controls */}
            <aside className="w-[480px] bg-stone-900 border-l border-white/15 h-full p-8 flex flex-col justify-between shadow-2xl">
              {/* Panel Header with D-Pad Navigable Close Button */}
              <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-4 shrink-0">
                <div className="flex items-center space-x-3">
                  <Settings className="w-8 h-8 text-amber-400" />
                  <h3 className="text-3xl font-black text-white">Settings</h3>
                </div>
                <button
                  onClick={() => {
                    playPinPopSound();
                    setShowSettings(false);
                  }}
                  data-focused={currentFocusItem?.type === 'close'}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer border-2 ${
                    currentFocusItem?.type === 'close'
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5)]'
                      : 'bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700 border-white/10'
                  }`}
                  title="Close Settings (or press Back)"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Navigable Settings Options: single unified scroll container with safe px-4 py-4 padding */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
                {/* Household Name */}
                <div
                  onClick={() => {
                    playPinPopSound();
                    setShowNameModal(true);
                  }}
                  data-focused={currentFocusItem?.type === 'household_name'}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    currentFocusItem?.type === 'household_name'
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-800/80 border-white/10 text-stone-200 hover:bg-stone-800 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <Home
                      className={`w-7 h-7 ${
                        currentFocusItem?.type === 'household_name' ? 'text-stone-950' : 'text-amber-400'
                      }`}
                    />
                    <div className="text-left">
                      <div
                        className={`text-xl font-bold ${
                          currentFocusItem?.type === 'household_name' ? 'text-stone-950' : 'text-white'
                        }`}
                      >
                        {state.householdName}
                      </div>
                      <div
                        className={`text-xs ${
                          currentFocusItem?.type === 'household_name' ? 'text-stone-900 font-bold' : 'text-stone-400'
                        }`}
                      >
                        Household Name • Click or Press OK to Change
                      </div>
                    </div>
                  </div>
                  <div
                    className={`p-2 rounded-xl ${
                      currentFocusItem?.type === 'household_name'
                        ? 'bg-stone-950/20 text-stone-950'
                        : 'bg-stone-700/60 text-amber-400'
                    }`}
                  >
                    <Edit3 className="w-5 h-5" />
                  </div>
                </div>

                {/* Autonomous AI Organize Toggle */}
                <div
                  onClick={() => {
                    playPinPopSound();
                    storageSync.toggleAutonomousAiOrganize();
                  }}
                  data-focused={currentFocusItem?.type === 'ai_organize'}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    currentFocusItem?.type === 'ai_organize'
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-800/80 border-white/10 text-stone-200 hover:bg-stone-800 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <Sparkles
                      className={`w-7 h-7 ${
                        currentFocusItem?.type === 'ai_organize' ? 'text-stone-950' : 'text-purple-400'
                      }`}
                    />
                    <div className="text-left">
                      <div
                        className={`text-xl font-bold ${
                          currentFocusItem?.type === 'ai_organize' ? 'text-stone-950' : 'text-white'
                        }`}
                      >
                        Autonomous AI Organize
                      </div>
                      <div
                        className={`text-xs ${
                          currentFocusItem?.type === 'ai_organize' ? 'text-stone-900 font-bold' : 'text-stone-400'
                        }`}
                      >
                        {state.autonomousAiOrganize ? 'Enabled (Auto-sorts pins)' : 'Disabled'}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`w-14 h-8 rounded-full p-1 flex items-center transition-colors ${
                      currentFocusItem?.type === 'ai_organize'
                        ? state.autonomousAiOrganize
                          ? 'bg-stone-950'
                          : 'bg-stone-900/60'
                        : state.autonomousAiOrganize
                        ? 'bg-purple-600'
                        : 'bg-stone-700'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full shadow-md transform transition-transform ${
                        currentFocusItem?.type === 'ai_organize' ? 'bg-amber-300' : 'bg-white'
                      } ${state.autonomousAiOrganize ? 'translate-x-6' : 'translate-x-0'}`}
                    />
                  </div>
                </div>

                {/* Texture Theme */}
                <div
                  onClick={() => {
                    playPinPopSound();
                    storageSync.setTheme(state.theme === 'cork' ? 'slate' : 'cork');
                  }}
                  data-focused={currentFocusItem?.type === 'theme'}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    currentFocusItem?.type === 'theme'
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-800/80 border-white/10 text-stone-200 hover:bg-stone-800 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <Tv
                      className={`w-7 h-7 ${
                        currentFocusItem?.type === 'theme' ? 'text-stone-950' : 'text-amber-400'
                      }`}
                    />
                    <div className="text-left">
                      <div
                        className={`text-xl font-bold ${
                          currentFocusItem?.type === 'theme' ? 'text-stone-950' : 'text-white'
                        }`}
                      >
                        Board Texture
                      </div>
                      <div
                        className={`text-xs ${
                          currentFocusItem?.type === 'theme' ? 'text-stone-900 font-bold' : 'text-stone-400'
                        }`}
                      >
                        {state.theme === 'cork' ? 'Warm Natural Cork' : 'Brushed Dark Slate'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold px-3 py-1 rounded-lg ${
                      currentFocusItem?.type === 'theme'
                        ? 'bg-stone-950/20 text-stone-950 font-black'
                        : 'bg-black/30 text-stone-200'
                    }`}
                  >
                    {state.theme === 'cork' ? 'Cork 🪵' : 'Slate 🪨'}
                  </span>
                </div>

                {/* Family Members Collapsible Section */}
                <div className="rounded-2xl border-2 border-white/10 bg-stone-800/80 overflow-hidden transition-all">
                  {/* Collapsible Header */}
                  <div
                    onClick={() => {
                      playPinPopSound();
                      setIsMembersExpanded((prev) => !prev);
                    }}
                    data-focused={currentFocusItem?.type === 'members_header'}
                    className={`p-5 transition-all cursor-pointer flex items-center justify-between ${
                      currentFocusItem?.type === 'members_header'
                        ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                        : 'text-stone-200 hover:bg-stone-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Users
                        className={`w-6 h-6 ${
                          currentFocusItem?.type === 'members_header' ? 'text-stone-950' : 'text-amber-400'
                        }`}
                      />
                      <div className="text-left">
                        <div className="text-xl font-bold flex items-center gap-2">
                          <span
                            className={
                              currentFocusItem?.type === 'members_header' ? 'text-stone-950' : 'text-white'
                            }
                          >
                            Family Members
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                              currentFocusItem?.type === 'members_header'
                                ? 'bg-stone-950/20 text-stone-950'
                                : 'bg-stone-700 text-stone-200'
                            }`}
                          >
                            {state.members.length}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {isMembersExpanded ? (
                        <ChevronDown
                          className={`w-5 h-5 ${
                            currentFocusItem?.type === 'members_header' ? 'text-stone-950' : 'text-amber-400'
                          }`}
                        />
                      ) : (
                        <ChevronRight
                          className={`w-5 h-5 ${
                            currentFocusItem?.type === 'members_header' ? 'text-stone-950' : 'text-stone-400'
                          }`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content: kept directly in the parent container, NO nested child scrollbar */}
                  {isMembersExpanded && (
                    <div className="p-4 pt-2 space-y-3 border-t border-white/10 bg-stone-900/60 animate-in fade-in duration-150">
                      {/* "+ Add Family Member" Button -> Automatically rotates OTP & reveals QR */}
                      <button
                        onClick={() => {
                          playJoinSuccessSound();
                          storageSync.rotateOtp();
                          setIsQrRevealed(true);
                        }}
                        data-focused={currentFocusItem?.type === 'add_member'}
                        className={`w-full p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-center space-x-2 text-base font-bold ${
                          currentFocusItem?.type === 'add_member'
                            ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                            : 'bg-stone-800 hover:bg-stone-700 text-amber-300 border-amber-400/30'
                        }`}
                      >
                        <UserPlus className="w-5 h-5 shrink-0" />
                        <span>Add Family Member (Show QR)</span>
                      </button>

                      {/* Members List (Rendered directly in parent, no nested scrollbar) */}
                      <div className="space-y-2 pt-1">
                        {state.members.map((m) => {
                          const isRemoveFocused =
                            currentFocusItem?.type === 'remove_member' &&
                            currentFocusItem.memberId === m.id;
                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-stone-950/70 border border-white/5 text-sm"
                            >
                              <div className="flex items-center space-x-2.5">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 shadow-sm"
                                  style={{ backgroundColor: m.avatarHex || '#F59E0B' }}
                                >
                                  {m.name.charAt(0)}
                                </div>
                                <span className="font-bold text-white text-base">{m.name}</span>
                                {m.role === 'HOST' && (
                                  <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                                    Host
                                  </span>
                                )}
                              </div>

                              {m.role !== 'HOST' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    playPinPopSound();
                                    setMemberToConfirmRemove(m);
                                    setConfirmDialogFocusIndex(0);
                                  }}
                                  data-focused={isRemoveFocused}
                                  className={`p-2 rounded-lg transition-all cursor-pointer border ${
                                    isRemoveFocused
                                      ? 'ring-4 ring-rose-500 bg-rose-600 text-white border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.5)]'
                                      : 'text-stone-400 hover:text-rose-400 hover:bg-stone-800 border-transparent'
                                  }`}
                                  title={`Remove ${m.name}`}
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Done Button */}
              <div className="pt-4 border-t border-white/10 shrink-0">
                <button
                  onClick={() => {
                    playPinPopSound();
                    setShowSettings(false);
                  }}
                  data-focused={currentFocusItem?.type === 'done'}
                  className={`w-full py-4 rounded-2xl font-bold text-xl transition-all cursor-pointer flex items-center justify-center space-x-3 border-2 ${
                    currentFocusItem?.type === 'done'
                      ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                      : 'bg-stone-800 text-stone-200 hover:text-white hover:bg-stone-700 border-white/10'
                  }`}
                >
                  <Check className="w-6 h-6 shrink-0" />
                  <span>Done</span>
                </button>
              </div>
            </aside>

            {/* 10-FOOT CONFIRMATION MODAL: Remove Family Member */}
            {memberToConfirmRemove && (
              <div
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200"
                onClick={() => setMemberToConfirmRemove(null)}
              >
                <div
                  className="bg-stone-900 border-4 border-rose-500/80 rounded-3xl p-10 max-w-xl w-full text-center shadow-[0_0_80px_rgba(244,63,94,0.3)] animate-in zoom-in-95 duration-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center">
                    <UserX className="w-10 h-10 text-rose-400" />
                  </div>

                  <h3 className="text-3xl font-black text-white mb-3">
                    Remove {memberToConfirmRemove.name}?
                  </h3>

                  <p className="text-lg text-stone-300 mb-8 leading-relaxed">
                    Are you sure you want to remove <span className="font-bold text-white">{memberToConfirmRemove.name}</span> from {state.householdName}? Pinned notes on the board will remain intact.
                  </p>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        playPinPopSound();
                        setMemberToConfirmRemove(null);
                      }}
                      data-focused={confirmDialogFocusIndex === 0}
                      className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                        confirmDialogFocusIndex === 0
                          ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-xl'
                          : 'bg-stone-800 text-stone-300 border-white/10 hover:bg-stone-700'
                      }`}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        playPinPopSound();
                        storageSync.removeMember(memberToConfirmRemove.id);
                        setMemberToConfirmRemove(null);
                        setSettingsFocusIndex((prev) => Math.max(0, prev - 1));
                      }}
                      data-focused={confirmDialogFocusIndex === 1}
                      className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                        confirmDialogFocusIndex === 1
                          ? 'ring-4 ring-rose-500 bg-rose-600 text-white font-black border-rose-400 shadow-xl'
                          : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/60'
                      }`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* 10-FOOT CONFIRMATION MODAL: Delete Note */}
      {noteToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-200"
          onClick={() => setNoteToDelete(null)}
        >
          <div
            className="bg-stone-900 border-4 border-rose-500/80 rounded-3xl p-10 max-w-xl w-full text-center shadow-[0_0_80px_rgba(244,63,94,0.3)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400">
              <Trash2 className="w-10 h-10" />
            </div>

            <h3 className="text-3xl font-black text-white mb-3">
              Delete Note?
            </h3>

            <p className="text-lg text-stone-300 mb-8 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-white">"{noteToDelete.title}"</span> from the TV board? This action cannot be undone.
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  playPinPopSound();
                  setNoteToDelete(null);
                }}
                data-focused={deleteConfirmFocusIndex === 0}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                  deleteConfirmFocusIndex === 0
                    ? 'ring-4 ring-amber-400 bg-amber-400 text-stone-950 font-black border-amber-300 shadow-xl'
                    : 'bg-stone-800 text-stone-300 border-white/10 hover:bg-stone-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  playPinPopSound();
                  storageSync.deleteNote(noteToDelete.id);
                  setNoteToDelete(null);
                  setFocusedModalNote(null);
                  setFocusedIndex((prev) => Math.max(0, Math.min(prev, currentNotes.length - 2)));
                }}
                data-focused={deleteConfirmFocusIndex === 1}
                className={`flex-1 py-4 px-6 rounded-2xl font-bold text-xl transition-all cursor-pointer border-2 ${
                  deleteConfirmFocusIndex === 1
                    ? 'ring-4 ring-rose-500 bg-rose-600 text-white font-black border-rose-400 shadow-xl'
                    : 'bg-rose-950/40 text-rose-300 border-rose-500/30 hover:bg-rose-900/60'
                }`}
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Household Name Change Modal (10-foot TV Remote / Voice) */}
      <HouseholdNameModal
        isOpen={showNameModal}
        currentName={state.householdName}
        onSave={(newName) => {
          storageSync.setHouseholdName(newName);
          setState(storageSync.getHouseholdState());
        }}
        onClose={() => setShowNameModal(false)}
      />
    </div>
  );
};
