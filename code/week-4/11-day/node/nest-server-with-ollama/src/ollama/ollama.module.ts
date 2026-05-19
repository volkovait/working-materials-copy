import { Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { OllamaController } from './ollama.controller';

// Модуль для запроса к Ollama
@Module({
  controllers: [OllamaController],
  providers: [OllamaService],
})
export class OllamaModule {}
