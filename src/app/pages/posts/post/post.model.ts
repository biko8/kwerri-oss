import { SafeHtml } from '@angular/platform-browser';

export interface Post {
  title: string;
  datetime: string;
  img?: string;
  imgFull?: string;
  imgShare?: string;
  slug?: string;
  short?: string;
  content?: string | SafeHtml;
}