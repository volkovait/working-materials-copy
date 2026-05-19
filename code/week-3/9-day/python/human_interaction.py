import questionary


def get_human_input(question: str) -> tuple[str, str | None]:
    action = questionary.select(
        "Выберите действие:",
        choices=[
            "continue - продолжить выполнение",
            "update - изменить аргументы",
            "feedback - оставить обратную связь",
        ],
    ).ask()

    # Extract the action part before the dash
    action = action.split(" - ")[0]

    # If action requires additional input, ask for it
    additional_input = None
    if action in ["update", "feedback"]:
        prompt = (
            "Введите новые аргументы"
            if action == "update"
            else "Введите вашу обратную связь"
        )
        additional_input = questionary.text(prompt).ask()

    return action, additional_input


def get_human_input_rewind(question: str) -> tuple[str, str | None]:
    action = questionary.select(
        "Выберите действие:",
        choices=[
            "continue - продолжить выполнение",
            "update - изменить аргументы",
            "feedback - оставить обратную связь",
            "rewind - откатить заново"
        ],
    ).ask()

    # Extract the action part before the dash
    action = action.split(" - ")[0]

    # If action requires additional input, ask for it
    additional_input = None
    if action in ["update", "feedback"]:
        prompt = (
            "Введите новые аргументы"
            if action == "update"
            else "Введите вашу обратную связь"
        )
        additional_input = questionary.text(prompt).ask()

    return action, additional_input