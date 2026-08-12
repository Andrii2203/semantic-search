# Design Standard: Ubuntu Terminal Style

This document defines the primary visual identity for the Semantic Search Engine project.

## 🎨 The Winner: Style 19 (Linux Ubuntu)

The chosen design follows the aesthetic of a classic Ubuntu Linux terminal. It combines a professional developer environment with high-contrast, readable elements.

### Key Visual Tokens

| Element | Value | Description |
| :--- | :--- | :--- |
| **Primary Background** | `#300a24` | Classic Ubuntu Aubergine |
| **Header Bar** | `#5e2750` | Darker top border (28px height) |
| **Primary Accent** | `#e95420` | Ubuntu Orange (Buttons) |
| **Secondary Accent** | `#c74416` | Darker Orange (Button Hover) |
| **Prompt Color** | `text-orange-500` | Command line prompt (`andrii@ubuntu:~$`) |
| **Typography** | `font-mono` | Monospace for all terminal inputs/outputs |
| **Window Controls** | Red, Yellow, Green | Decorative dots in the top-left corner |

### 🛠 Reference Implementation (React)

```jsx
const StyleLinux = () => (
  <div className="p-8 bg-[#300a24] rounded-lg border-t-[28px] border-[#5e2750] space-y-4 font-mono shadow-2xl relative">
    {/* Terminal Dots */}
    <div className="absolute top-[-22px] left-3 flex gap-1.5">
       <div className="w-3 h-3 rounded-full bg-[#df382c]" />
       <div className="w-3 h-3 rounded-full bg-[#efb73e]" />
       <div className="w-3 h-3 rounded-full bg-[#2da44e]" />
    </div>
    
    {/* Command Line Prompt */}
    <div className="text-orange-500 text-xs mb-2">
      andrii@ubuntu:~$ <span className="text-white">semantic-search --engine</span>
    </div>
    
    {/* Transparent Terminal Input */}
    <Input 
      className="bg-transparent border-none text-white h-10 p-0 focus-visible:ring-0" 
      placeholder="type command..." 
    />
    
    {/* Magnetic Ubuntu Button */}
    <MagneticButton 
      className="bg-[#e95420] text-white px-6 py-2 rounded-sm hover:bg-[#c74416] transition-colors"
    >
      Execute
    </MagneticButton>
  </div>
)
```

## 📐 Design Principles
1. **Authenticity:** The UI must feel like a real terminal session.
2. **Focus:** No unnecessary borders or boxes around text inputs.
3. **Responsiveness:** The "Window" container should scale while maintaining the aspect of a terminal.
4. **Interaction:** Use the "Subtle Magnet" effect for all primary action buttons.
