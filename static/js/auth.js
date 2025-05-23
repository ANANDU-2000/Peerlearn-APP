/**
 * Authentication and registration form handling for PeerLearn
 */

// Popular domains for autocomplete suggestions
const popularDomains = [
  'Web Development', 'Mobile App Development', 'Software Engineering', 'Data Science',
  'Machine Learning', 'Artificial Intelligence', 'DevOps', 'Cloud Computing',
  'Cybersecurity', 'Blockchain', 'Game Development', 'UX/UI Design',
  'Digital Marketing', 'Product Management', 'Mathematics', 'Physics',
  'Chemistry', 'Biology', 'English Literature', 'History', 'Philosophy',
  'Business Management', 'Finance', 'Economics', 'Law', 'Medicine',
  'Psychology', 'Sociology', 'Foreign Languages', 'Music', 'Art'
];

// Skills for autocomplete suggestions
const allSkills = [
  // Programming Languages
  'Python', 'JavaScript', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Swift', 'Go', 'Rust', 'TypeScript',
  // Web Technologies
  'HTML', 'CSS', 'React', 'Angular', 'Vue.js', 'Node.js', 'Express.js', 'Django', 'Flask', 'Ruby on Rails',
  'Bootstrap', 'Tailwind CSS', 'GraphQL', 'REST API', 'WordPress', 'Laravel', 'Spring Boot',
  // Databases
  'MySQL', 'PostgreSQL', 'MongoDB', 'SQLite', 'Oracle', 'Redis', 'Firebase', 'DynamoDB', 'Cassandra',
  // Mobile Development
  'Android', 'iOS', 'React Native', 'Flutter', 'Kotlin', 'SwiftUI', 'Xamarin', 'Ionic',
  // Data Science & ML
  'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy', 'R', 'MATLAB', 'Tableau', 'Power BI',
  'Data Analysis', 'Data Visualization', 'Natural Language Processing', 'Computer Vision',
  // DevOps & Cloud
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud', 'Jenkins', 'Git', 'GitHub Actions',
  'Terraform', 'Ansible', 'Linux', 'Bash Scripting', 'CI/CD',
  // Design
  'Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Sketch', 'InVision', 'UI Design', 'UX Research',
  'Wireframing', 'Prototyping',
  // Soft Skills
  'Project Management', 'Agile', 'Scrum', 'Communication', 'Team Leadership', 'Problem Solving',
  // Other Technologies
  'Blockchain', 'Ethereum', 'Smart Contracts', 'Unity', 'Unreal Engine', 'AR/VR',
  'Embedded Systems', 'IoT'
];

document.addEventListener('DOMContentLoaded', function() {
  // Learner signup form functionality
  window.signupForm = function() {
    return {
      currentStep: 1,
      isStepValid: false,
      previewUrl: null,
      formData: {
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password1: '',
        password2: '',
        interests: '',
        career_goal: '',
        bio: ''
      },
      popularCategories: [
        'Programming', 'Web Development', 'Data Science', 'Design', 'Business', 
        'Marketing', 'Mathematics', 'Science', 'Languages', 'Music'
      ],
      
      initForm() {
        // Form initialization happens in the template with Django template tags
        this.validateStep1();
      },
      
      nextStep() {
        if (this.isStepValid) {
          this.currentStep++;
          this.validateCurrentStep();
        }
      },
      
      prevStep() {
        if (this.currentStep > 1) {
          this.currentStep--;
          this.validateCurrentStep();
        }
      },
      
      validateCurrentStep() {
        switch(this.currentStep) {
          case 1: this.validateStep1(); break;
          case 2: this.validateStep2(); break;
          case 3: this.validateStep3(); break;
          case 4: this.isStepValid = true; break;
        }
      },
      
      validateStep1() {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const usernameRegex = /^[a-zA-Z0-9@.+_-]+$/;
        
        const isEmailValid = emailRegex.test(this.formData.email);
        const isUsernameValid = usernameRegex.test(this.formData.username) && this.formData.username.length <= 150;
        const isPasswordValid = this.formData.password1.length >= 8;
        const doPasswordsMatch = this.formData.password1 === this.formData.password2;
        
        this.isStepValid = isEmailValid && isUsernameValid && isPasswordValid && doPasswordsMatch;
      },
      
      validateStep2() {
        this.isStepValid = this.formData.interests.trim().length > 0;
      },
      
      validateStep3() {
        this.isStepValid = this.formData.career_goal.trim().length > 0;
      },
      
      handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.previewUrl = e.target.result;
          };
          reader.readAsDataURL(file);
        }
      },
      
      isInterestSelected(category) {
        const interests = this.formData.interests.split(',').map(item => item.trim());
        return interests.includes(category);
      },
      
      toggleInterest(category) {
        const interests = this.formData.interests.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (this.isInterestSelected(category)) {
          // Remove the category
          const index = interests.indexOf(category);
          if (index !== -1) {
            interests.splice(index, 1);
          }
        } else {
          // Add the category
          interests.push(category);
        }
        
        this.formData.interests = interests.join(', ');
        this.validateStep2();
      }
    };
  };
  
  // Mentor signup form functionality
  window.mentorSignupForm = function() {
    return {
      currentStep: 1,
      isStepValid: false,
      previewUrl: null,
      showPassword: false,
      emailExists: false,
      emailValid: true,
      emailChecking: false,
      emailMessage: '',
      resumeFromLocal: false,
      formData: {
        username: '',
        email: '',
        first_name: '',
        last_name: '',
        password1: '',
        password2: '',
        expertise: '',
        skills: '',
        phone_number: '',
        bio: '',
        intro_video: ''
      },
      
      get filteredDomains() {
        if (!this.searchTerm) return [];
        return this.popularDomains.filter(domain => 
          domain.toLowerCase().includes(this.searchTerm.toLowerCase())
        );
      },
      
      get filteredSkills() {
        if (!this.skillSearchTerm) return [];
        return this.allSkills.filter(skill => 
          skill.toLowerCase().includes(this.skillSearchTerm.toLowerCase())
        );
      },
      
      initForm() {
        // Check if there's saved form data in localStorage
        const savedData = localStorage.getItem('mentorSignupFormData');
        
        // Set default email validation state
        this.emailValid = false;
        
        if (savedData) {
          try {
            // Ask user if they want to resume registration
            if (confirm('Would you like to resume your previous registration?')) {
              const parsedData = JSON.parse(savedData);
              
              // Merge saved data with default form data
              Object.keys(parsedData).forEach(key => {
                if (this.formData.hasOwnProperty(key)) {
                  this.formData[key] = parsedData[key];
                }
              });
              
              // Determine which step to resume from
              if (parsedData.currentStep) {
                this.currentStep = parsedData.currentStep;
              } else if (this.formData.profile_picture) {
                this.currentStep = 5;
              } else if (this.formData.bio || this.formData.intro_video) {
                this.currentStep = 4;
              } else if (this.formData.skills || this.formData.phone_number) {
                this.currentStep = 3;
              } else if (this.formData.expertise) {
                this.currentStep = 2;
              } else {
                this.currentStep = 1;
              }
              
              // If we have a profile picture preview, restore it
              if (parsedData.previewUrl) {
                this.previewUrl = parsedData.previewUrl;
              }
              
              // Check if the saved email is valid
              if (this.formData.email) {
                this.checkEmailExists();
              }
            } else {
              // If user doesn't want to resume, clear the stored data
              localStorage.removeItem('mentorSignupFormData');
            }
          } catch (e) {
            console.error('Error parsing saved form data:', e);
            localStorage.removeItem('mentorSignupFormData');
          }
        }
        
        // Add form change listener to save data as user types
        this.setupFormAutoSave();
        
        // Set up email validation event
        const emailInput = document.getElementById('id_email');
        if (emailInput) {
          emailInput.addEventListener('blur', () => {
            this.checkEmailExists();
          });
          
          // Add debounced input handler for real-time validation
          let emailTimeout;
          emailInput.addEventListener('input', () => {
            clearTimeout(emailTimeout);
            emailTimeout = setTimeout(() => {
              this.checkEmailExists();
            }, 500); // Wait 500ms after typing stops
          });
        }
        
        // Form initialization happens in the template with Django template tags
        this.validateCurrentStep();
        
        // Add event listener for beforeunload to warn about losing progress
        window.addEventListener('beforeunload', (e) => {
          if (this.currentStep > 1) {
            e.preventDefault();
            e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            return e.returnValue;
          }
        });
      },
      
      setupFormAutoSave() {
        // Setup a debounced auto-save function
        let saveTimeout;
        const saveFormData = () => {
          clearTimeout(saveTimeout);
          saveTimeout = setTimeout(() => {
            // Save form data to localStorage
            const dataToSave = { ...this.formData, currentStep: this.currentStep };
            
            // Also save preview URL if we have one
            if (this.previewUrl) {
              dataToSave.previewUrl = this.previewUrl;
            }
            
            localStorage.setItem('mentorSignupFormData', JSON.stringify(dataToSave));
          }, 500); // Wait 500ms before saving to avoid too frequent saves
        };
        
        // Watch for changes in form data and current step
        this.$watch('formData', () => {
          saveFormData();
        }, { deep: true });
        
        this.$watch('currentStep', () => {
          saveFormData();
        });
      },
      
      nextStep() {
        if (this.isStepValid) {
          this.currentStep++;
          this.validateCurrentStep();
        }
      },
      
      prevStep() {
        if (this.currentStep > 1) {
          this.currentStep--;
          this.validateCurrentStep();
        }
      },
      
      validateCurrentStep() {
        switch(this.currentStep) {
          case 1: this.validateStep1(); break;
          case 2: this.validateStep2(); break;
          case 3: this.validateStep3(); break;
          case 4: this.validateStep4(); break;
          case 5: this.isStepValid = true; break;
        }
      },
      
      checkEmailExists() {
        const email = this.formData.email;
        
        // Don't check empty emails
        if (!email || email.trim() === '') {
          this.emailExists = false;
          this.emailValid = false;
          this.emailMessage = '';
          return;
        }
        
        // Validate email format first
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          this.emailValid = false;
          this.emailMessage = 'Please enter a valid email address';
          return;
        }
        
        // Show loading state
        this.emailChecking = true;
        
        // Make API call to check if email exists
        fetch(`/users/api/check-email/?email=${encodeURIComponent(email)}`)
          .then(response => response.json())
          .then(data => {
            this.emailExists = data.exists;
            this.emailValid = data.is_valid && !data.exists;
            this.emailMessage = data.message;
            
            // Update validation status
            this.updateInputValidation('id_email', this.emailValid);
            
            // Update overall step validation
            this.validateStep1();
          })
          .catch(error => {
            console.error('Error checking email:', error);
            // Fallback to simple regex validation on error
            this.emailValid = emailRegex.test(email);
            this.updateInputValidation('id_email', this.emailValid);
          })
          .finally(() => {
            this.emailChecking = false;
          });
      },
      
      validateStep1() {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const usernameRegex = /^[a-zA-Z0-9@.+_-]+$/;
        
        // For immediate feedback while API is checking
        const isBasicEmailValid = emailRegex.test(this.formData.email);
        
        // For final validation, consider both format and existence check
        const isEmailValid = this.emailValid;
        
        const isUsernameValid = usernameRegex.test(this.formData.username) && this.formData.username.length <= 150;
        const isNameValid = this.formData.first_name.trim().length > 0 && this.formData.last_name.trim().length > 0;
        const isPasswordValid = this.formData.password1.length >= 8;
        const doPasswordsMatch = this.formData.password1 === this.formData.password2;
        
        // Update input field borders based on validation
        this.updateInputValidation('id_username', isUsernameValid);
        this.updateInputValidation('id_first_name', this.formData.first_name.trim().length > 0);
        this.updateInputValidation('id_last_name', this.formData.last_name.trim().length > 0);
        this.updateInputValidation('id_password1', isPasswordValid);
        this.updateInputValidation('id_password2', doPasswordsMatch && this.formData.password2.length > 0);
        
        // For email, we set validation in the checkEmailExists function
        
        this.isStepValid = isEmailValid && isUsernameValid && isNameValid && isPasswordValid && doPasswordsMatch;
      },
      
      validateStep2() {
        const isExpertiseValid = this.formData.expertise.trim().length > 0;
        this.updateInputValidation('id_expertise', isExpertiseValid);
        this.isStepValid = isExpertiseValid;
      },
      
      validateStep3() {
        const isSkillsValid = this.formData.skills.trim().length > 0;
        this.updateInputValidation('id_skills', isSkillsValid);
        this.isStepValid = isSkillsValid;
      },
      
      validateStep4() {
        const isBioValid = this.formData.bio.trim().length > 0;
        this.updateInputValidation('id_bio', isBioValid);
        this.isStepValid = isBioValid;
      },
      
      updateInputValidation(inputId, isValid) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        if (isValid) {
          input.classList.remove('border-red-500');
          input.classList.add('border-green-500');
          
          // Add check mark if not already present
          let checkMarkId = `${inputId}-check`;
          if (!document.getElementById(checkMarkId)) {
            const checkMark = document.createElement('span');
            checkMark.id = checkMarkId;
            checkMark.className = 'absolute right-3 top-1/2 transform -translate-y-1/2 text-green-500';
            checkMark.innerHTML = '✓';
            
            // Find the parent with relative positioning
            const parent = input.parentElement;
            if (parent && !parent.classList.contains('relative')) {
              parent.classList.add('relative');
            }
            parent.appendChild(checkMark);
          }
        } else {
          input.classList.remove('border-green-500');
          input.classList.add('border-red-500');
          
          // Remove check mark if present
          const checkMark = document.getElementById(`${inputId}-check`);
          if (checkMark) {
            checkMark.remove();
          }
        }
      },
      
      handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.previewUrl = e.target.result;
          };
          reader.readAsDataURL(file);
        }
      },
      
      isDomainSelected(domain) {
        const expertise = this.formData.expertise.split(',').map(item => item.trim());
        return expertise.includes(domain);
      },
      
      toggleDomain(domain) {
        const expertise = this.formData.expertise.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (this.isDomainSelected(domain)) {
          // Remove the domain
          const index = expertise.indexOf(domain);
          if (index !== -1) {
            expertise.splice(index, 1);
          }
        } else {
          // Add the domain
          expertise.push(domain);
        }
        
        this.formData.expertise = expertise.join(', ');
        this.validateStep2();
      },
      
      addDomainSuggestion(domain) {
        const expertise = this.formData.expertise.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (!this.isDomainSelected(domain)) {
          expertise.push(domain);
        }
        
        this.formData.expertise = expertise.join(', ');
        this.searchTerm = '';
        this.showSuggestions = false;
        this.validateStep2();
      },
      
      handleExpertiseInput(e) {
        const value = e.target.value;
        this.formData.expertise = value;
        
        // Get the last term after a comma
        const terms = value.split(',');
        const lastTerm = terms[terms.length - 1].trim();
        
        if (lastTerm.length > 0) {
          this.searchTerm = lastTerm;
          this.showSuggestions = true;
        } else {
          this.showSuggestions = false;
        }
        
        this.validateStep2();
      },
      
      isSkillSelected(skill) {
        const skills = this.formData.skills.split(',').map(item => item.trim());
        return skills.includes(skill);
      },
      
      addSkillSuggestion(skill) {
        const skills = this.formData.skills.split(',').map(item => item.trim()).filter(item => item !== '');
        
        if (!this.isSkillSelected(skill)) {
          skills.push(skill);
        }
        
        this.formData.skills = skills.join(', ');
        this.skillSearchTerm = '';
        this.showSkillSuggestions = false;
        this.validateStep3();
      },
      
      handleSkillsInput(e) {
        const value = e.target.value;
        this.formData.skills = value;
        
        // Get the last term after a comma
        const terms = value.split(',');
        const lastTerm = terms[terms.length - 1].trim();
        
        if (lastTerm.length > 0) {
          this.skillSearchTerm = lastTerm;
          this.showSkillSuggestions = true;
        } else {
          this.showSkillSuggestions = false;
        }
        
        this.validateStep3();
      }
    };
  };
});
