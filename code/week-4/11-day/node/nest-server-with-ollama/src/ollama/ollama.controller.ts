import { Controller, Post, Body } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { CompletionRequestDto } from './dto/create-ollama.dto';

// Контроллер для запроса к Ollama
@Controller('/v1/completions')
export class OllamaController {
  constructor(private readonly ollamaService: OllamaService) { }

  @Post()
  prompt(@Body() dto: CompletionRequestDto) {
    return this.ollamaService.prompt(dto.prompt);
  }
}
