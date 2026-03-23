import {
  Component,
  Input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-section-title',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="section-title" [class]="'section-title--' + align">
      @if (eyebrow) {
        <span class="section-title__eyebrow">{{ eyebrow }}</span>
      }
      <h2 class="section-title__heading">{{ title }}</h2>
      @if (subtitle) {
        <p class="section-title__subtitle">{{ subtitle }}</p>
      }
      @if (showDivider) {
        <div class="section-title__divider"></div>
      }
    </div>
  `,
  styles: [`
    .section-title {
      margin-bottom: 3rem;

      &--center {
        text-align: center;

        .section-title__subtitle {
          margin-left: auto;
          margin-right: auto;
        }

        .section-title__divider {
          margin-left: auto;
          margin-right: auto;
        }
      }

      &--left {
        text-align: left;
      }

      &--right {
        text-align: right;

        .section-title__divider {
          margin-left: auto;
        }
      }

      &__eyebrow {
        display: inline-block;
        font-size: 0.8125rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #3982AA;
        padding: 0.25rem 0.875rem;
        background: rgba(57, 130, 170, 0.1);
        border-radius: 9999px;
        border-left: 3px solid #3982AA;
        margin-bottom: 0.875rem;
      }

      &__heading {
        font-size: clamp(1.6rem, 3.5vw, 2.5rem);
        font-weight: 800;
        line-height: 1.15;
        color: #0F1F2E;
        margin-bottom: 1rem;
        letter-spacing: -0.01em;
      }

      &__subtitle {
        font-size: clamp(1rem, 1.75vw, 1.125rem);
        color: #5a7080;
        line-height: 1.7;
        max-width: 600px;
        margin-bottom: 0;
      }

      &__divider {
        width: 60px;
        height: 4px;
        background: linear-gradient(to right, #3982AA, #f0c040);
        border-radius: 2px;
        margin-top: 1.25rem;
      }
    }
  `],
})
export class SectionTitleComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() eyebrow = '';
  @Input() align: 'center' | 'left' | 'right' = 'center';
  @Input() showDivider = true;
}
