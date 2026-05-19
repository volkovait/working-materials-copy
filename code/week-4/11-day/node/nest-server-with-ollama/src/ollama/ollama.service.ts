import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Сервис для запроса к Ollama
@Injectable()
export class OllamaService {
  constructor(private readonly configService: ConfigService) { }
  async prompt(prompt: string) {
    const url = this.configService.getOrThrow<string>('OLLAMA_URL');
    const model = this.configService.getOrThrow<string>('MODEL_NAME');
    const ollamaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
      }),
    });
    return ollamaRes.json();
  }
}
