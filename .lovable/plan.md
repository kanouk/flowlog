

# タスク完了アニメーション修正計画

## 問題の原因

### 1. CSSの `cos()` / `sin()` 関数の互換性問題
`confetti-burst` アニメーションでCSSの三角関数（`cos()`, `sin()`）を使用していますが、これらはブラウザサポートが限定的です。

### 2. アニメーション登録漏れ
`confetti-burst` が `animation` セクションに登録されていないため、インラインスタイルで直接指定する必要があります（現在そうしていますが、keyframes自体が動作しません）。

---

## 解決策：JavaScriptで計算済みの座標を使用

CSS変数ではなく、レンダリング時にJavaScriptで座標を計算し、シンプルなCSSアニメーションを適用します。

---

## 変更内容

### 1. src/index.css - シンプルなconfettiアニメーションを追加

```css
@keyframes confetti-fly {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 1;
  }
  20% {
    transform: translate(var(--tx-mid), var(--ty-mid)) scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translate(var(--tx-end), var(--ty-end)) scale(0.5);
    opacity: 0;
  }
}

.confetti-particle {
  animation: confetti-fly var(--duration) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  animation-delay: var(--delay);
}
```

### 2. src/components/ui/task-checkbox.tsx - JS側で座標を計算

```typescript
function ConfettiParticles() {
  const particles = Array.from({ length: 16 }, (_, i) => i);
  const colors = [...];
  
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((i) => {
        const angleRad = ((i / 16) * 360 + Math.random() * 20) * (Math.PI / 180);
        const distance = 20 + Math.random() * 25;
        
        // JavaScriptで座標を計算
        const txMid = `${Math.cos(angleRad) * distance * 0.5}px`;
        const tyMid = `${Math.sin(angleRad) * distance * 0.5 - 10}px`;
        const txEnd = `${Math.cos(angleRad) * distance}px`;
        const tyEnd = `${Math.sin(angleRad) * distance + 15}px`;
        
        return (
          <span
            key={i}
            className={`absolute confetti-particle ${size} ${shape} ${color}`}
            style={{
              left: '50%',
              top: '50%',
              '--tx-mid': txMid,
              '--ty-mid': tyMid,
              '--tx-end': txEnd,
              '--ty-end': tyEnd,
              '--duration': `${500 + Math.random() * 200}ms`,
              '--delay': `${i * 25}ms`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}
```

---

## オプション：さらに気持ちよくする追加エフェクト

| エフェクト | 説明 |
|----------|------|
| チェックマークの輝き | 完了時にアイコンが一瞬光る |
| 背景フラッシュ | チェックボックス周囲が緑色に一瞬光る |
| パーティクル数増加 | 16個 → 24個でより豪華に |
| スパークル追加 | キラキラした星形パーティクルを追加 |

---

## 変更対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/index.css` | `confetti-fly` アニメーションと `.confetti-particle` クラスを追加 |
| `src/components/ui/task-checkbox.tsx` | JSで座標計算、新しいアニメーションクラスを適用 |

