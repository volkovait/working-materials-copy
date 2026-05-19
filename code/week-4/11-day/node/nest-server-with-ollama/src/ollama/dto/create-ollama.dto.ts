import { IsString, IsNotEmpty } from 'class-validator';

// Описание запроса для запроса к Ollama
export class CompletionRequestDto {
    @IsString()
    @IsNotEmpty()
    prompt: string;
}
